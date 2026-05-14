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
  const serverLtpk = Buffer.from(creds.serverLtpk, 'hex')

  // Generate ephemeral X25519 keypair
  const ePk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES)
  const eSk = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES)
  sodium.crypto_box_keypair(ePk, eSk)

  const keys = await new Promise((resolve, reject) => {
    conn.on('error', reject)

    conn.on('frame', ({ payload }) => {
      try {
        const msg = opack.decode(payload)
        if (!msg._pd) return

        const tlv = tlvDecode(msg._pd)
        const state = tlv[Tag.STATE]?.[0]

        if (tlv[Tag.ERROR]) {
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

          // Decrypt and verify server identity
          const serverSub = open(sessionKey, labelNonce('PV-Msg02'), encData)
          const serverTLV = tlvDecode(serverSub)
          const serverId = serverTLV[Tag.IDENTIFIER].toString()
          const serverSig = serverTLV[Tag.SIGNATURE]

          // serverInfo = serverEPk || serverId || clientEPk
          const serverInfo = Buffer.concat([serverEPk, Buffer.from(serverId), ePk])
          if (!sodium.crypto_sign_verify_detached(serverSig, serverInfo, serverLtpk)) {
            return reject(new Error('Server verify signature invalid'))
          }

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
          conn.send(FrameType.PV_NEXT, opack.encode({ _pd: m3Data }))

          // Derive session read/write keys from shared secret
          const readKey = hkdf(
            shared,
            Buffer.from('Control-Salt'),
            Buffer.from('Control-Read-Encryption-Key'),
            32
          )
          const writeKey = hkdf(
            shared,
            Buffer.from('Control-Salt'),
            Buffer.from('Control-Write-Encryption-Key'),
            32
          )

          resolve({ readKey, writeKey })
        }
      } catch (err) {
        reject(err)
      }
    })

    // PV M1: send our ephemeral public key
    const m1Data = tlvEncode({ [Tag.STATE]: 0x01, [Tag.PUBLIC_KEY]: ePk })
    conn.send(FrameType.PV_START, opack.encode({ _pd: m1Data }))
  })

  return { conn, ...keys }
}

module.exports = { verify }
