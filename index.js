const fs = require('fs')
const path = require('path')
const process = require('process')
const ReadyResource = require('ready-resource')
const AppleTVDiscovery = require('./lib/appletv')
const { pair: runPairing } = require('./lib/pairing')
const { sleep: runSleep, wakeDevice: runWake } = require('./lib/commands')

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
  fs.writeFileSync(file, JSON.stringify(creds, null, 2))
}

class AppleTVRemote extends ReadyResource {
  constructor(opts = {}) {
    super()
    this.onpin = opts.onpin || null
    this.debug = opts.debug || false
    this._creds = opts.credentials || null
    this._credentialsFile = opts.credentialsFile || DEFAULT_CREDS_FILE

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
      const devices = await AppleTVRemote.scan({ debug: this.debug })
      if (!devices.length) throw new Error('No Apple TVs found on the network')
      const device = devices[0]
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
