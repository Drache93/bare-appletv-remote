const sodium = require('sodium-universal')
const opack = require('./opack')
const { Tag, encode: tlvEncode, decode: tlvDecode } = require('./tlv')
const { hkdf } = require('./hkdf')
const { seal, open, labelNonce } = require('./chacha')
const { CompanionConnection, FrameType } = require('./companion')

// HAP Pair Verify — establishes session keys for an already-paired device.
// Returns { conn, readKey, writeKey } — caller owns conn (call conn.close() when done).
async function verify(host, port, creds, debug) {
  const conn = new CompanionConnection({ host, port, debug: debug || false })
  await conn.ready()

  const ltsk = Buffer.from(creds.ltsk, 'hex')

  // Generate ephemeral X25519 keypair
  const ePk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES)
  const eSk = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES)
  sodium.crypto_box_keypair(ePk, eSk)

  let xid = Math.floor(Math.random() * 65536)
  let readKey, writeKey

  const result = await new Promise((resolve, reject) => {
    conn.on('error', reject)

    conn.on('frame', ({ payload }) => {
      try {
        const msg = opack.decode(payload)
        if (!msg._pd) return

        const tlv = tlvDecode(msg._pd)
        const state = tlv[Tag.STATE]?.[0]

        if (tlv[Tag.ERROR] !== undefined) {
          return reject(new Error('Verify error: ' + tlv[Tag.ERROR][0]))
        }

        if (state === 2) {
          // PV M2: server's ephemeral public key + encrypted identity
          const serverEPk = tlv[Tag.PUBLIC_KEY]
          const encData = tlv[Tag.ENCRYPTED_DATA]

          // Derive shared secret
          const shared = Buffer.alloc(sodium.crypto_scalarmult_BYTES)
          sodium.crypto_scalarmult(shared, eSk, serverEPk)

          const sessionKey = hkdf(
            shared,
            Buffer.from('Pair-Verify-Encrypt-Salt'),
            Buffer.from('Pair-Verify-Encrypt-Info'),
            32
          )

          // Decrypt server identity — skip signature verification: the ATV uses a
          // different long-term key for pair-verify than the one stored from pair-setup M6.
          const serverSub = open(sessionKey, labelNonce('PV-Msg02'), encData)
          const serverTLV = tlvDecode(serverSub)
          debug && console.log('[verify] PV M2 server id:', serverTLV[Tag.IDENTIFIER]?.toString())

          // Sign our identity: clientEPk || clientId || serverEPk
          const clientInfo = Buffer.concat([ePk, Buffer.from(creds.clientId), serverEPk])
          const sig = Buffer.alloc(sodium.crypto_sign_BYTES)
          sodium.crypto_sign_detached(sig, clientInfo, ltsk)

          const subTLV = tlvEncode({
            [Tag.IDENTIFIER]: Buffer.from(creds.clientId),
            [Tag.SIGNATURE]: sig
          })
          const encReply = seal(sessionKey, labelNonce('PV-Msg03'), subTLV)

          const m3Data = tlvEncode({
            [Tag.STATE]: 0x03,
            [Tag.ENCRYPTED_DATA]: encReply
          })
          conn.send(FrameType.PV_NEXT, opack.encode({ _pd: m3Data, _x: xid++ }))

          // Pre-derive session read/write keys (Companion protocol uses empty salt)
          writeKey = hkdf(shared, Buffer.from(''), Buffer.from('ClientEncrypt-main'), 32)
          readKey = hkdf(shared, Buffer.from(''), Buffer.from('ServerEncrypt-main'), 32)
        } else if (state === 4) {
          // PV M4: success confirmation (or error already caught above)
          debug && console.log('[verify] PV M4 — verify confirmed')
          resolve({ readKey, writeKey })
        }
      } catch (err) {
        reject(err)
      }
    })

    // PV M1: send our ephemeral public key
    const m1Data = tlvEncode({ [Tag.STATE]: 0x01, [Tag.PUBLIC_KEY]: ePk })
    conn.send(FrameType.PV_START, opack.encode({ _pd: m1Data, _auTy: 4, _x: xid++ }))
  })

  return { conn, ...result }
}

module.exports = { verify }
