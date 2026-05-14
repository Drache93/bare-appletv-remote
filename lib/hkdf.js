const crypto = require('crypto')

// HKDF-SHA512 (RFC 5869)
function hkdf(ikm, salt, info, length) {
  // Extract
  const prk = crypto.createHmac('sha512', salt).update(ikm).digest()

  // Expand
  const chunks = []
  let prev = Buffer.alloc(0)
  let i = 1
  let total = 0
  while (total < length) {
    const block = crypto
      .createHmac('sha512', prk)
      .update(prev)
      .update(info)
      .update(Buffer.from([i++]))
      .digest()
    chunks.push(block)
    prev = block
    total += block.length
  }
  return Buffer.concat(chunks).slice(0, length)
}

module.exports = { hkdf }
