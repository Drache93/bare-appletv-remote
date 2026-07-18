const opack = require('./opack')
const { seal, open, counterNonce, TAG_LEN } = require('./chacha')
const { FrameType } = require('./companion')

const E_OPACK = FrameType.E_OPACK

// AAD = the on-wire frame header: type byte + 3-byte BE payload length.
// The ATV authenticates this header alongside the ciphertext.
function frameAAD(payloadLen) {
  return Buffer.from([
    E_OPACK,
    (payloadLen >> 16) & 0xff,
    (payloadLen >> 8) & 0xff,
    payloadLen & 0xff
  ])
}

// Wraps a verified CompanionConnection with ChaCha20-Poly1305 encryption.
class Session {
  constructor(conn, readKey, writeKey) {
    this._conn = conn
    this._readKey = readKey
    this._writeKey = writeKey
    this._sendCounter = 0
    this._recvCounter = 0
    this._handler = null

    // Decrypt every incoming frame so _recvCounter stays in sync, regardless
    // of whether a handler is registered. onMessage() just sets the handler.
    this._conn.on('frame', ({ type, payload }) => {
      if (type !== E_OPACK) return
      try {
        const msg = this.decrypt(payload)
        // The ATV drops clients that leave heartbeats unanswered
        if (msg._i === '_heartbeat' || msg._i === '_ping') {
          this.send({ _i: msg._i === '_ping' ? '_pong' : '_heartbeat', _t: 3, _x: msg._x ?? 0 })
          return
        }
        if (this._handler) this._handler(msg)
      } catch (err) {
        this._conn.emit('error', err)
      }
    })
  }

  // Send an OPACK object as an encrypted E_OPACK frame
  send(obj) {
    const plaintext = opack.encode(obj)
    const nonce = counterNonce(this._sendCounter++)
    const payloadLen = plaintext.length + TAG_LEN
    const aad = frameAAD(payloadLen)
    const encrypted = seal(this._writeKey, nonce, plaintext, aad)
    this._conn.send(E_OPACK, encrypted)
  }

  // Decrypt an incoming E_OPACK payload, returns decoded object
  decrypt(payload) {
    const nonce = counterNonce(this._recvCounter++)
    const aad = frameAAD(payload.length)
    const plaintext = open(this._readKey, nonce, payload, aad)
    return opack.decode(plaintext)
  }

  // Set the handler for decrypted incoming messages (replaces any previous handler)
  onMessage(fn) {
    this._handler = fn
  }

  async close() {
    await this._conn.close()
  }
}

module.exports = { Session }
