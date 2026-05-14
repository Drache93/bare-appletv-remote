const opack = require('./opack')
const { seal, open, counterNonce } = require('./chacha')
const { FrameType } = require('./companion')

// Wraps a verified CompanionConnection with ChaCha20-Poly1305 encryption.
class Session {
  constructor(conn, readKey, writeKey) {
    this._conn = conn
    this._readKey = readKey
    this._writeKey = writeKey
    this._sendCounter = 0
    this._recvCounter = 0
  }

  // Send an OPACK object as an encrypted E_OPACK frame
  send(obj) {
    const plaintext = opack.encode(obj)
    const nonce = counterNonce(this._sendCounter++)
    const encrypted = seal(this._writeKey, nonce, plaintext)
    this._conn.send(FrameType.E_OPACK, encrypted)
  }

  // Decrypt an incoming E_OPACK payload, returns decoded object
  decrypt(payload) {
    const nonce = counterNonce(this._recvCounter++)
    const plaintext = open(this._readKey, nonce, payload)
    return opack.decode(plaintext)
  }

  // Attach a handler for decrypted incoming messages
  onMessage(fn) {
    this._conn.on('frame', ({ type, payload }) => {
      if (type !== FrameType.E_OPACK) return
      try {
        fn(this.decrypt(payload))
      } catch (err) {
        this._conn.emit('error', err)
      }
    })
  }

  async close() {
    await this._conn.close()
  }
}

module.exports = { Session }
