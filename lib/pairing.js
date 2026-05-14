const sodium = require('sodium-universal')
const { SRPClient } = require('./srp')
const opack = require('./opack')
const { Tag, encode: tlvEncode, decode: tlvDecode } = require('./tlv')
const { hkdf } = require('./hkdf')
const { seal, open, labelNonce } = require('./chacha')
const { CompanionConnection, FrameType } = require('./companion')

// Complete HAP Pairing Setup M1–M6, returns credentials object
async function pair(host, port, getPinFn, debug) {
  const conn = new CompanionConnection({ host, port, debug: debug || false })

  await conn.ready()
  debug && console.log('[pair] connected')

  let srp = null
  let serverPublicKey = null
  let salt = null
  let clientId = null
  let ltsk = null
  let ltpk = null
  let xid = Math.floor(Math.random() * 65536)

  const creds = await new Promise((resolve, reject) => {
    conn.on('error', reject)

    conn.on('frame', async ({ payload }) => {
      try {
        const msg = opack.decode(payload)
        debug && console.log('[pair] frame keys:', Object.keys(msg))
        if (!msg._pd) return

        const tlv = tlvDecode(msg._pd)
        const state = tlv[Tag.STATE]?.[0]
        debug && console.log('[pair] TLV state:', state, 'tags:', Object.keys(tlv))

        if (tlv[Tag.ERROR] !== undefined) {
          const code = tlv[Tag.ERROR][0]
          const names = {
            1: 'Unknown',
            2: 'Authentication',
            3: 'Backoff (too many attempts — wait or reset HomeKit on the TV)',
            4: 'MaxPeers',
            5: 'MaxTries',
            6: 'Unavailable',
            7: 'Busy'
          }
          return reject(new Error('Pairing error: ' + (names[code] || code)))
        }

        if (state === 2) {
          // M2: got salt + server public key
          salt = tlv[Tag.SALT]
          serverPublicKey = tlv[Tag.PUBLIC_KEY]

          console.log('[pair] M2 received — PIN dialog should now be visible on your Apple TV')
          const pin = await getPinFn()
          console.log('[pair] PIN entered:', pin)
          srp = new SRPClient('Pair-Setup', pin)
          srp.computeSharedSecret(salt, serverPublicKey)
          const proof = srp.computeProof(serverPublicKey)

          const m3Data = tlvEncode({
            [Tag.STATE]: 0x03,
            [Tag.PUBLIC_KEY]: srp.getPublicKey(),
            [Tag.PROOF]: proof
          })
          conn.send(FrameType.PS_NEXT, opack.encode({ _pd: m3Data, _pwTy: 1, _x: xid++ }))
        } else if (state === 4) {
          // M4: server proof verified
          const serverProof = tlv[Tag.PROOF]
          if (!srp.verifyServerProof(serverProof)) {
            return reject(new Error('Server proof invalid'))
          }

          // Derive session key for M5/M6 from SRP session key
          const K = srp.getSessionKey() // 64 bytes (SHA-512 of SRP shared secret)
          const sessionKey = hkdf(
            K,
            Buffer.from('Pair-Setup-Encrypt-Salt'),
            Buffer.from('Pair-Setup-Encrypt-Info'),
            32
          )

          // Derive iOSDeviceX for signing
          const deviceX = hkdf(
            K,
            Buffer.from('Pair-Setup-Controller-Sign-Salt'),
            Buffer.from('Pair-Setup-Controller-Sign-Info'),
            32
          )

          // Generate Ed25519 long-term keypair
          ltpk = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES)
          ltsk = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES)
          sodium.crypto_sign_keypair(ltpk, ltsk)

          // Unique client pairing ID
          clientId = _randomUUID()

          // Sign: deviceX || clientId || ltpk
          const signMsg = Buffer.concat([deviceX, Buffer.from(clientId), ltpk])
          const sig = Buffer.alloc(sodium.crypto_sign_BYTES)
          sodium.crypto_sign_detached(sig, signMsg, ltsk)

          // Encrypt sub-TLV — tag 0x11 stores an OPACK-encoded device name, required
          // for the ATV to store us in the Companion controller store (not HAP-only).
          // Without it pair-verify fails with Authentication error (error=2).
          const nameOpack = opack.encode({ name: 'Bare Remote' })
          const subTLV = tlvEncode({
            [Tag.IDENTIFIER]: Buffer.from(clientId),
            [Tag.PUBLIC_KEY]: ltpk,
            [Tag.SIGNATURE]: sig,
            0x11: nameOpack
          })
          const encryptedData = seal(sessionKey, labelNonce('PS-Msg05'), subTLV)

          const m5Data = tlvEncode({
            [Tag.STATE]: 0x05,
            [Tag.ENCRYPTED_DATA]: encryptedData
          })
          conn.send(FrameType.PS_NEXT, opack.encode({ _pd: m5Data, _pwTy: 1, _x: xid++ }))
        } else if (state === 6) {
          // M6: server sends its identity
          const K = srp.getSessionKey()
          const sessionKey = hkdf(
            K,
            Buffer.from('Pair-Setup-Encrypt-Salt'),
            Buffer.from('Pair-Setup-Encrypt-Info'),
            32
          )

          const encData = tlv[Tag.ENCRYPTED_DATA]
          const serverSubTLV = open(sessionKey, labelNonce('PS-Msg06'), encData)
          const serverTLV = tlvDecode(serverSubTLV)

          const serverId = serverTLV[Tag.IDENTIFIER].toString()
          const serverLtpk = serverTLV[Tag.PUBLIC_KEY]
          const serverSig = serverTLV[Tag.SIGNATURE]

          // Verify server signature
          const serverX = hkdf(
            K,
            Buffer.from('Pair-Setup-Accessory-Sign-Salt'),
            Buffer.from('Pair-Setup-Accessory-Sign-Info'),
            32
          )
          const serverMsg = Buffer.concat([serverX, Buffer.from(serverId), serverLtpk])
          if (!sodium.crypto_sign_verify_detached(serverSig, serverMsg, serverLtpk)) {
            return reject(new Error('Server signature invalid'))
          }

          resolve({
            clientId,
            ltsk: ltsk.toString('hex'),
            ltpk: ltpk.toString('hex'),
            serverId,
            serverLtpk: serverLtpk.toString('hex')
          })
        }
      } catch (err) {
        reject(err)
      }
    })

    // Send M1 — _pwTy:1 signals the TV to display the PIN dialog on screen
    const m1Data = tlvEncode({ [Tag.METHOD]: 0x00, [Tag.STATE]: 0x01 })
    conn.send(FrameType.PS_START, opack.encode({ _pd: m1Data, _pwTy: 1, _x: xid++ }))
  })

  await conn.close()
  return creds
}

function _randomUUID() {
  const b = Buffer.alloc(16)
  sodium.randombytes_buf(b)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = b.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

module.exports = { pair }
