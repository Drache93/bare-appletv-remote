// HAP TLV8 encode/decode

const Tag = {
  METHOD: 0x00,
  IDENTIFIER: 0x01,
  SALT: 0x02,
  PUBLIC_KEY: 0x03,
  PROOF: 0x04,
  ENCRYPTED_DATA: 0x05,
  STATE: 0x06,
  ERROR: 0x07,
  SIGNATURE: 0x0a
}

function encode(fields) {
  const chunks = []
  for (const [tag, value] of Object.entries(fields)) {
    const tagNum = parseInt(tag)
    const buf = Buffer.isBuffer(value) ? value : Buffer.from([value])
    let offset = 0
    do {
      const chunkLen = Math.min(255, buf.length - offset)
      chunks.push(Buffer.from([tagNum, chunkLen]))
      chunks.push(buf.subarray(offset, offset + chunkLen))
      offset += chunkLen
    } while (offset < buf.length)
    if (buf.length === 0) chunks.push(Buffer.from([tagNum, 0]))
  }
  return Buffer.concat(chunks)
}

function decode(buf) {
  const result = {}
  let pos = 0
  while (pos < buf.length) {
    const tag = buf[pos++]
    const len = buf[pos++]
    const value = buf.subarray(pos, pos + len)
    pos += len
    result[tag] = result[tag] ? Buffer.concat([result[tag], value]) : Buffer.from(value)
  }
  return result
}

module.exports = { Tag, encode, decode }
