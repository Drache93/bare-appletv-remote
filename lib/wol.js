const dgram = require('bare-dgram')

// Send a Wake-on-LAN magic packet to a MAC address.
// address: device IP (unicast WoL — bare-dgram has no setBroadcast API)
function wake(mac, address) {
  return new Promise((resolve, reject) => {
    const macHex = mac.replace(/[:\-]/g, '')
    if (macHex.length !== 12) {
      return reject(new Error('Invalid MAC address: ' + mac))
    }

    const macBuf = Buffer.from(macHex, 'hex')
    const magic = Buffer.concat([Buffer.alloc(6, 0xff), ...Array(16).fill(macBuf)])

    const dest = address || '255.255.255.255'
    const socket = dgram.createSocket('udp4')
    socket.send(magic, 0, magic.length, 9, dest, (err) => {
      socket.close()
      if (err) reject(err)
      else resolve()
    })
    socket.on('error', reject)
  })
}

module.exports = { wake }
