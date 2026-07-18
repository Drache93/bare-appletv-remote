const fs = require('fs')
const path = require('path')
const process = require('process')
const ReadyResource = require('ready-resource')
const AppleTVDiscovery = require('./lib/appletv')
const { pair: runPairing } = require('./lib/pairing')
const {
  openSession,
  sendHID,
  sendTouchEvent,
  sendTouchEndEvent,
  sendAppLaunch,
  HID,
  TouchPhase,
  wakeDevice: runWake
} = require('./lib/commands')

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
    this._sessionOpening = null
    this._idleTimer = null
    this._touchBase = 0
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
      console.log(
        `[pair] found: ${device.name} (${device.address}:${device.port}) model=${device.model} rpfl=0x${rpfl.toString(16)} pinSupported=${pinSupported}`
      )
      creds = await AppleTVRemote.pair(device, this.onpin, { debug: this.debug })
      saveCreds(this._credentialsFile, creds)
      this.emit('paired')
    }

    this._creds = creds
    this.name = creds.name
    this.address = creds.address
    this.port = creds.port
    this.mac = creds.mac || null
  }

  async _close() {
    await this._closeSession()
  }

  async _getSession() {
    if (!this._sessionHandle) {
      if (!this._sessionOpening) {
        this._sessionOpening = this._openSession().finally(() => {
          this._sessionOpening = null
        })
      }
      await this._sessionOpening
    }
    this._resetIdle()
    return this._sessionHandle
  }

  async _openSession() {
    const handle = await this._connect()
    this._sessionHandle = handle
    handle.conn.once('close', () => {
      if (this._sessionHandle !== handle) return
      clearTimeout(this._idleTimer)
      this._idleTimer = null
      this._sessionHandle = null
    })
    return handle
  }

  // Pair-verify on a fresh connection, retried. Never pairs — a definitive
  // credential rejection surfaces as EREVOKED for the caller to handle
  // via repair(), so a transient failure can't burn a PIN prompt.
  async _connect() {
    let err = null
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 300))
      try {
        return await openSession(this._creds, this.debug)
      } catch (e) {
        err = e
        this.debug && console.log(`[session] connect attempt ${attempt + 1} failed:`, e.message)
        // Connection-level failure — address may be stale (DHCP renewal or ATV restart)
        if (e.verifyError === undefined && attempt === 0) await this._rediscover()
      }
    }
    if (err.verifyError === 2) {
      const revoked = new Error(
        'Apple TV rejected the stored credentials — call repair() to pair again'
      )
      revoked.code = 'EREVOKED'
      revoked.cause = err
      throw revoked
    }
    throw err
  }

  async _rediscover() {
    const devices = await AppleTVRemote.scan({ debug: this.debug })
    const device = this._findDevice(devices)
    if (!device) return
    this._creds = { ...this._creds, address: device.address, port: device.port }
    saveCreds(this._credentialsFile, this._creds)
    this.address = device.address
    this.port = device.port
  }

  _findDevice(devices) {
    return devices.find(
      (d) => (this._creds.mac && d.txt?.rpAD === this._creds.mac) || d.name === this._creds.name
    )
  }

  // Explicit re-pair with the ATV, reusing our existing identity so the ATV
  // replaces the old pairing record. Prompts via onpin.
  async repair() {
    if (!this.onpin) throw new Error('repair() requires an onpin callback')
    if (!this._creds) this._creds = loadCreds(this._credentialsFile)
    if (!this._creds) throw new Error('No credentials to re-pair — pairing happens on ready()')

    await this._closeSession()

    const devices = await AppleTVRemote.scan({ debug: this.debug })
    const device = this._findDevice(devices)
    if (!device) throw new Error('Apple TV not found on the network')

    const creds = await AppleTVRemote.pair(device, this.onpin, {
      debug: this.debug,
      identity: this._creds
    })
    this._creds = creds
    saveCreds(this._credentialsFile, creds)
    this.name = creds.name
    this.address = creds.address
    this.port = creds.port
    this.mac = creds.mac || null
    this.emit('paired')
  }

  _resetIdle() {
    clearTimeout(this._idleTimer)
    if (this._idleMs > 0) {
      this._idleTimer = setTimeout(() => this._closeSession(), this._idleMs)
    }
  }

  async _closeSession() {
    clearTimeout(this._idleTimer)
    this._idleTimer = null
    if (this._sessionOpening) {
      try {
        await this._sessionOpening
      } catch {
        // open failed — nothing to close
      }
    }
    const handle = this._sessionHandle
    this._sessionHandle = null
    if (handle) await handle.close()
  }

  async sleep() {
    if (!this.opened) await this.ready()
    sendHID(await this._getSession(), HID.sleep)
  }

  async playPause() {
    if (!this.opened) await this.ready()
    sendHID(await this._getSession(), HID.playPause)
  }

  async menu() {
    if (!this.opened) await this.ready()
    sendHID(await this._getSession(), HID.menu)
  }

  async back() {
    if (!this.opened) await this.ready()
    sendHID(await this._getSession(), HID.back)
  }

  async home() {
    if (!this.opened) await this.ready()
    sendHID(await this._getSession(), HID.home)
  }

  async settings() {
    if (!this.opened) await this.ready()
    sendAppLaunch(await this._getSession(), 'com.apple.TVSettings')
  }

  async volumeUp() {
    if (!this.opened) await this.ready()
    sendHID(await this._getSession(), HID.volumeUp)
  }

  async volumeDown() {
    if (!this.opened) await this.ready()
    sendHID(await this._getSession(), HID.volumeDown)
  }

  async up() {
    if (!this.opened) await this.ready()
    sendHID(await this._getSession(), HID.up)
  }

  async down() {
    if (!this.opened) await this.ready()
    sendHID(await this._getSession(), HID.down)
  }

  async left() {
    if (!this.opened) await this.ready()
    sendHID(await this._getSession(), HID.left)
  }

  async right() {
    if (!this.opened) await this.ready()
    sendHID(await this._getSession(), HID.right)
  }

  async click() {
    if (!this.opened) await this.ready()
    sendHID(await this._getSession(), HID.click)
  }

  // Edge-to-edge travel by default — short center swipes don't register
  // as directional swipes on tvOS
  async swipe(direction, opts = {}) {
    const steps = opts.steps || 8
    const distance = opts.distance || 1000
    const stepDelay = opts.stepDelay || 18

    if (!this.opened) await this.ready()
    const handle = await this._getSession()

    const dx = direction === 'right' ? 1 : direction === 'left' ? -1 : 0
    const dy = direction === 'down' ? 1 : direction === 'up' ? -1 : 0

    const x0 = 500 - (dx * distance) / 2
    const y0 = 500 - (dy * distance) / 2

    const start = Date.now()

    sendTouchEvent(handle, x0, y0, TouchPhase.began, 0)

    for (let i = 1; i <= steps; i++) {
      await new Promise((r) => setTimeout(r, stepDelay))
      sendTouchEvent(
        handle,
        x0 + (dx * distance * i) / steps,
        y0 + (dy * distance * i) / steps,
        TouchPhase.moved,
        Date.now() - start
      )
    }

    sendTouchEvent(
      handle,
      x0 + dx * distance,
      y0 + dy * distance,
      TouchPhase.ended,
      Date.now() - start
    )

    await new Promise((r) => setTimeout(r, 50))
    sendTouchEndEvent(handle)

    await new Promise((r) => setTimeout(r, 100))
  }

  async touchBegin(x, y) {
    if (!this.opened) await this.ready()
    const handle = await this._getSession()
    this._touchBase = Date.now()
    sendTouchEvent(handle, x, y, TouchPhase.began, 0)
  }

  async touchMove(x, y) {
    if (!this.opened) await this.ready()
    sendTouchEvent(await this._getSession(), x, y, TouchPhase.moved, Date.now() - this._touchBase)
  }

  async touchEnd(x, y) {
    if (!this.opened) await this.ready()
    const handle = await this._getSession()
    sendTouchEvent(handle, x, y, TouchPhase.ended, Date.now() - this._touchBase)
    await new Promise((r) => setTimeout(r, 50))
    sendTouchEndEvent(handle)
  }

  async wake() {
    if (!this.opened) await this.ready()
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
    const creds = await runPairing(device.address, device.port, getPinFn, opts)
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
