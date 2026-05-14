const { Discovery } = require('bare-mdns-discovery')

class AppleTVDiscovery extends Discovery {
  constructor(opts = {}) {
    super({ ...opts, service: 'companion-link' })
  }

  _parseService(records, rinfo) {
    const service = super._parseService(records, rinfo)
    if (!service) return null

    // Filter to Apple TVs only
    if (!service.txt.rpMd || !service.txt.rpMd.startsWith('AppleTV')) {
      return null
    }

    return {
      uid: service.txt.rpMRtID || service.txt.rpAD || service.uid,
      name: service.name,
      address: service.address,
      port: service.port, // Use actual port from SRV record
      model: service.txt.rpMd,
      version: service.txt.rpVr,
      txt: service.txt
    }
  }
}

module.exports = AppleTVDiscovery
