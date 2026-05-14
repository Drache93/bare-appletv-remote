const dgram = require('bare-dgram')

// Send a Wake-on-LAN magic packet to a MAC address
// mac: hex string with or without colons/dashes (e.g. "aabbccddeeff" or "aa:bb:cc:dd:ee:ff")
function wake(mac) {
  return new Promise((resolve, reject) => {
    const macHex = mac.replace(/[:\-]/g, '')
    if (macHex.length !== 12) {
      return reject(new Error('Invalid MAC address: ' + mac))
    }

    const macBuf = Buffer.from(macHex, 'hex')
    const magic = Buffer.concat([Buffer.alloc(6, 0xff), ...Array(16).fill(macBuf)])

    const socket = dgram.createSocket('udp4')
    socket.bind(0, () => {
      socket.setBroadcast(true)
      socket.send(magic, 0, magic.length, 9, '255.255.255.255', (err) => {
        socket.close()
        if (err) reject(err)
        else resolve()
      })
    })
    socket.on('error', reject)
  })
}

module.exports = { wake }
