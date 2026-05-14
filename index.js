const fs = require('fs')
const path = require('path')
const process = require('process')
const ReadyResource = require('ready-resource')
const AppleTVDiscovery = require('./lib/appletv')
const { pair: runPairing } = require('./lib/pairing')
const { openSession, sendHID, sendTouchEvent, HID, TouchPhase, wakeDevice: runWake } = require('./lib/commands')

const DEFAULT_CREDS_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.appletv-credentials.json'
)

function loadCreds(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function saveCreds(file, creds) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(creds, null, 2))
}

class AppleTVRemote extends ReadyResource {
  constructor(opts = {}) {
    super()
    this.onpin = opts.onpin || null
    this.debug = opts.debug || false
    this._creds = opts.credentials || null
    this._credentialsFile = opts.credentialsFile || DEFAULT_CREDS_FILE
    this._host = opts.host || null
    this._port = opts.port || null
    this._idleMs = opts.idleTimeout || 0

    // Populated after ready()
    this.name = null
    this.address = null
    this.port = null
    this.mac = null

    this._sessionHandle = null
    this._idleTimer = null
  }

  async _open() {
    let creds = this._creds

    if (!creds) creds = loadCreds(this._credentialsFile)

    if (!creds) {
      if (!this.onpin) {
        throw new Error(
          'No credentials found and no onpin callback provided. ' +
            'Pass { onpin: async () => "123456" } to trigger pairing.'
        )
      }
      let device
      if (this._host) {
        device = { name: this._host, address: this._host, port: this._port, model: null, txt: {} }
      } else {
        const devices = await AppleTVRemote.scan({ debug: this.debug, first: true })
        if (!devices.length) throw new Error('No Apple TVs found on the network')
        device = devices[0]
      }
      const rpfl = parseInt(device.txt?.rpFl || device.txt?.rpfl || '0', 16)
      const pinSupported = !!(rpfl & 0x4000)
      console.log(`[pair] found: ${device.name} (${device.address}:${device.port}) model=${device.model} rpfl=0x${rpfl.toString(16)} pinSupported=${pinSupported}`)
      creds = await AppleTVRemote.pair(device, this.onpin, { debug: this.debug })
      saveCreds(this._credentialsFile, creds)
      this.emit('paired')
    }

    this._creds = creds
    this.name = creds.name
    this.address = creds.address
    this.port = creds.port
    this.mac = creds.mac || null

    await this._getSession()
  }

  async _close() {
    await this._closeSession()
  }

  async _getSession() {
    if (!this._sessionHandle) {
      this._sessionHandle = await openSession(this._creds, this.debug)
      this._sessionHandle.conn.once('close', () => {
        clearTimeout(this._idleTimer)
        this._idleTimer = null
        this._sessionHandle = null
      })
    }
    this._resetIdle()
    return this._sessionHandle
  }

  _resetIdle() {
    clearTimeout(this._idleTimer)
    if (this._idleMs > 0) {
      this._idleTimer = setTimeout(() => this._closeSession(), this._idleMs)
    }
  }

  async _closeSession() {
    const handle = this._sessionHandle
    this._sessionHandle = null
    clearTimeout(this._idleTimer)
    this._idleTimer = null
    if (handle) await handle.close()
  }

  async sleep() {
    await this.ready()
    sendHID(await this._getSession(), HID.sleep)
  }

  async playPause() {
    await this.ready()
    sendHID(await this._getSession(), HID.playPause)
  }

  async menu() {
    await this.ready()
    sendHID(await this._getSession(), HID.menu)
  }

  async back() {
    await this.ready()
    sendHID(await this._getSession(), HID.back)
  }

  async volumeUp() {
    await this.ready()
    sendHID(await this._getSession(), HID.volumeUp)
  }

  async volumeDown() {
    await this.ready()
    sendHID(await this._getSession(), HID.volumeDown)
  }

  async up() {
    await this.ready()
    sendHID(await this._getSession(), HID.up)
  }

  async down() {
    await this.ready()
    sendHID(await this._getSession(), HID.down)
  }

  async left() {
    await this.ready()
    sendHID(await this._getSession(), HID.left)
  }

  async right() {
    await this.ready()
    sendHID(await this._getSession(), HID.right)
  }

  async click() {
    await this.ready()
    sendHID(await this._getSession(), HID.click)
  }

  async touchBegin(x, y) {
    await this.ready()
    sendTouchEvent(await this._getSession(), x, y, TouchPhase.began)
  }

  async touchMove(x, y) {
    await this.ready()
    sendTouchEvent(await this._getSession(), x, y, TouchPhase.moved)
  }

  async touchEnd(x, y) {
    await this.ready()
    sendTouchEvent(await this._getSession(), x, y, TouchPhase.ended)
  }

  async swipe(direction, opts = {}) {
    const steps = opts.steps || 10
    const distance = opts.distance || 300
    const stepDelay = opts.stepDelay || 8

    await this.ready()
    const handle = await this._getSession()

    const dx = direction === 'right' ? 1 : direction === 'left' ? -1 : 0
    const dy = direction === 'down' ? 1 : direction === 'up' ? -1 : 0

    sendTouchEvent(handle, 500, 500, TouchPhase.began)
    for (let i = 1; i <= steps; i++) {
      await new Promise((r) => setTimeout(r, stepDelay))
      sendTouchEvent(handle, 500 + (dx * distance * i) / steps, 500 + (dy * distance * i) / steps, TouchPhase.moved)
    }
    sendTouchEvent(handle, 500 + dx * distance, 500 + dy * distance, TouchPhase.ended)
  }

  async wake() {
    await this.ready()
    await runWake(this._creds)
  }

  static async scan(opts = {}) {
    const discovery = new AppleTVDiscovery({ debug: opts.debug || false })
    await discovery.ready()
    const result = await discovery.discover({ first: opts.first || false })
    await discovery.close()
    if (!result) return []
    return Array.isArray(result) ? result : [result]
  }

  static async pair(device, getPinFn, opts = {}) {
    const creds = await runPairing(device.address, device.port, getPinFn, opts.debug || false)
    return {
      ...creds,
      name: device.name,
      address: device.address,
      port: device.port,
      model: device.model,
      mac: device.txt?.rpAD || null
    }
  }
}

module.exports = AppleTVRemote
