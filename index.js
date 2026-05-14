const fs = require('fs')
const path = require('path')
const process = require('process')
const ReadyResource = require('ready-resource')
const AppleTVDiscovery = require('./lib/appletv')
const { pair: runPairing } = require('./lib/pairing')
const { sleep: runSleep, playPause: runPlayPause, back: runBack, volumeUp: runVolumeUp, volumeDown: runVolumeDown, up: runUp, down: runDown, left: runLeft, right: runRight, click: runClick, wakeDevice: runWake } = require('./lib/commands')

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

    // Populated after ready()
    this.name = null
    this.address = null
    this.port = null
    this.mac = null
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
  }

  _close() {}

  async sleep() {
    await this.ready()
    await runSleep(this._creds, this.debug)
  }

  async playPause() {
    await this.ready()
    await runPlayPause(this._creds, this.debug)
  }

  async back() {
    await this.ready()
    await runBack(this._creds, this.debug)
  }

  async volumeUp() {
    await this.ready()
    await runVolumeUp(this._creds, this.debug)
  }

  async volumeDown() {
    await this.ready()
    await runVolumeDown(this._creds, this.debug)
  }

  async up() {
    await this.ready()
    await runUp(this._creds, this.debug)
  }

  async down() {
    await this.ready()
    await runDown(this._creds, this.debug)
  }

  async left() {
    await this.ready()
    await runLeft(this._creds, this.debug)
  }

  async right() {
    await this.ready()
    await runRight(this._creds, this.debug)
  }

  async click() {
    await this.ready()
    await runClick(this._creds, this.debug)
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
