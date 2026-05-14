const net = require('net')
const ReadyResource = require('ready-resource')

// Frame types
const FrameType = {
  PS_START: 0x03, // Pairing setup start
  PS_NEXT: 0x04, // Pairing setup next
  PV_START: 0x05, // Pair verify start
  PV_NEXT: 0x06, // Pair verify next
  E_OPACK: 0x08 // Encrypted OPACK
}

class CompanionConnection extends ReadyResource {
  constructor(opts = {}) {
    super()
    this.host = opts.host || opts.address
    this.port = opts.port
    this.debug = opts.debug || false

    this.socket = null
    this.buffer = Buffer.alloc(0)
    this.credentials = opts.credentials || null
  }

  _log(...args) {
    if (this.debug) console.log('[companion]', ...args)
  }

  async _open() {
    await new Promise((resolve, reject) => {
      this.socket = net.connect(this.port, this.host)

      this.socket.on('connect', () => {
        this._log('connected to', this.host + ':' + this.port)
        resolve()
      })

      this.socket.on('error', (err) => {
        this._log('socket error:', err.message)
        this.emit('error', err)
        reject(err)
      })

      this.socket.on('close', () => {
        this._log('socket closed')
        this.emit('close')
      })

      this.socket.on('data', (data) => {
        this._onData(data)
      })
    })
  }

  _onData(data) {
    this.buffer = Buffer.concat([this.buffer, data])
    this._processBuffer()
  }

  _processBuffer() {
    while (this.buffer.length >= 4) {
      // Frame header: 1 byte type + 3 bytes BE length
      const frameType = this.buffer[0]
      const length = (this.buffer[1] << 16) | (this.buffer[2] << 8) | this.buffer[3]

      // Check if we have full frame
      if (this.buffer.length < 4 + length) {
        break
      }

      // Extract payload
      const payload = this.buffer.subarray(4, 4 + length)
      this.buffer = this.buffer.subarray(4 + length)

      this._log('received frame type:', frameType.toString(16), 'len:', length)
      this.emit('frame', { type: frameType, payload })
    }
  }

  send(frameType, payload) {
    if (!this.socket) {
      throw new Error('Not connected')
    }

    const header = Buffer.alloc(4)
    header[0] = frameType
    header[1] = (payload.length >> 16) & 0xff
    header[2] = (payload.length >> 8) & 0xff
    header[3] = payload.length & 0xff

    const frame = Buffer.concat([header, payload])
    this._log('sending frame type:', frameType.toString(16), 'len:', payload.length)
    this.socket.write(frame)
  }

  _close() {
    if (this.socket) {
      this.socket.destroy()
      this.socket = null
    }
  }
}

module.exports = { CompanionConnection, FrameType }
