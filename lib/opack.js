// OPACK - Apple's binary serialization format (Companion Link subset)
// Integer encoding (corrected per Apple spec and reference implementations):
//   0x08–0x2F   small integers inline (value = byte - 0x08), range 0–39
//   0x30        uint8 with 1-byte length (40–255)
//   0x31        uint16 LE (256–65535)
//   0x32        uint32 LE (65536–4294967295)
//   0x33        uint64 LE (larger)
//   0x36        int64 LE (negative)
// String encoding:
//   0x40–0x60   inline string (length = byte - 0x40), 0–32 bytes
//   0x61–0x64   string with 1/2/4-byte length prefix
// Data encoding:
//   0x70–0x90   inline data (length = byte - 0x70), 0–32 bytes
//   0x91–0x94   data with 1/2/4-byte length prefix
// Other:
//   0x01/0x02   true/false
//   0x04        null
//   0xd0–0xdf   inline array (count = byte - 0xd0)
//   0xe0–0xef   inline dict (count = byte - 0xe0)

function encode(value) {
  const chunks = []
  _encode(value, chunks)
  return Buffer.concat(chunks)
}

function _encode(value, chunks) {
  if (value === null || value === undefined) {
    chunks.push(Buffer.from([0x04]))
  } else if (value === true) {
    chunks.push(Buffer.from([0x01]))
  } else if (value === false) {
    chunks.push(Buffer.from([0x02]))
  } else if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      if (value >= 0 && value <= 0x27) {
        chunks.push(Buffer.from([0x08 + value]))
      } else if (value >= 0 && value <= 0xff) {
        chunks.push(Buffer.from([0x30, value]))
      } else if (value >= 0 && value <= 0xffff) {
        const buf = Buffer.alloc(3)
        buf[0] = 0x31
        buf.writeUInt16LE(value, 1)
        chunks.push(buf)
      } else if (value >= 0 && value <= 0xffffffff) {
        const buf = Buffer.alloc(5)
        buf[0] = 0x32
        buf.writeUInt32LE(value, 1)
        chunks.push(buf)
      } else if (value < 0) {
        const buf = Buffer.alloc(9)
        buf[0] = 0x36
        buf.writeBigInt64LE(BigInt(value), 1)
        chunks.push(buf)
      } else {
        const buf = Buffer.alloc(9)
        buf[0] = 0x33
        buf.writeBigUInt64LE(BigInt(value), 1)
        chunks.push(buf)
      }
    } else {
      // Float64 (rarely used in Companion protocol)
      const buf = Buffer.alloc(9)
      buf[0] = 0x0d
      buf.writeDoubleLE(value, 1)
      chunks.push(buf)
    }
  } else if (typeof value === 'string') {
    const strBuf = Buffer.from(value, 'utf8')
    if (strBuf.length <= 0x20) {
      chunks.push(Buffer.from([0x40 + strBuf.length]))
      chunks.push(strBuf)
    } else if (strBuf.length <= 0xff) {
      chunks.push(Buffer.from([0x61, strBuf.length]))
      chunks.push(strBuf)
    } else if (strBuf.length <= 0xffff) {
      const header = Buffer.alloc(3)
      header[0] = 0x62
      header.writeUInt16LE(strBuf.length, 1)
      chunks.push(header)
      chunks.push(strBuf)
    } else {
      const header = Buffer.alloc(5)
      header[0] = 0x63
      header.writeUInt32LE(strBuf.length, 1)
      chunks.push(header)
      chunks.push(strBuf)
    }
  } else if (Buffer.isBuffer(value)) {
    if (value.length <= 0x20) {
      chunks.push(Buffer.from([0x70 + value.length]))
      chunks.push(value)
    } else if (value.length <= 0xff) {
      chunks.push(Buffer.from([0x91, value.length]))
      chunks.push(value)
    } else if (value.length <= 0xffff) {
      const header = Buffer.alloc(3)
      header[0] = 0x92
      header.writeUInt16LE(value.length, 1)
      chunks.push(header)
      chunks.push(value)
    } else {
      const header = Buffer.alloc(5)
      header[0] = 0x93
      header.writeUInt32LE(value.length, 1)
      chunks.push(header)
      chunks.push(value)
    }
  } else if (Array.isArray(value)) {
    if (value.length <= 0x0f) {
      chunks.push(Buffer.from([0xd0 + value.length]))
    } else {
      chunks.push(Buffer.from([0xdc]))
      _encode(value.length, chunks)
    }
    for (const item of value) {
      _encode(item, chunks)
    }
  } else if (typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length <= 0x0f) {
      chunks.push(Buffer.from([0xe0 + keys.length]))
    } else {
      chunks.push(Buffer.from([0xec]))
      _encode(keys.length, chunks)
    }
    for (const key of keys) {
      _encode(key, chunks)
      _encode(value[key], chunks)
    }
  }
}

function decode(buf) {
  const state = { pos: 0, buf }
  return _decode(state)
}

function _decode(state) {
  const type = state.buf[state.pos++]

  if (type === 0x01) return true
  if (type === 0x02) return false
  if (type === 0x03) return null // terminator
  if (type === 0x04) return null

  // Small integers (0x08–0x2F, value = byte - 0x08)
  if (type >= 0x08 && type <= 0x2f) {
    return type - 0x08
  }

  // Integers with length prefix
  if (type === 0x30) {
    return state.buf[state.pos++]
  }
  if (type === 0x31) {
    const val = state.buf.readUInt16LE(state.pos)
    state.pos += 2
    return val
  }
  if (type === 0x32) {
    const val = state.buf.readUInt32LE(state.pos)
    state.pos += 4
    return val
  }
  if (type === 0x33) {
    const val = state.buf.readBigUInt64LE(state.pos)
    state.pos += 8
    return Number(val)
  }
  if (type === 0x36) {
    const val = state.buf.readBigInt64LE(state.pos)
    state.pos += 8
    return Number(val)
  }

  // Float64
  if (type === 0x0d) {
    const val = state.buf.readDoubleLE(state.pos)
    state.pos += 8
    return val
  }

  // Inline strings (0x40–0x60, length = byte - 0x40)
  if (type >= 0x40 && type <= 0x60) {
    const len = type - 0x40
    const str = state.buf.toString('utf8', state.pos, state.pos + len)
    state.pos += len
    return str
  }

  // Strings with length prefix
  if (type === 0x61) {
    const len = state.buf[state.pos++]
    const str = state.buf.toString('utf8', state.pos, state.pos + len)
    state.pos += len
    return str
  }
  if (type === 0x62) {
    const len = state.buf.readUInt16LE(state.pos)
    state.pos += 2
    const str = state.buf.toString('utf8', state.pos, state.pos + len)
    state.pos += len
    return str
  }
  if (type === 0x63) {
    const len = state.buf.readUInt32LE(state.pos)
    state.pos += 4
    const str = state.buf.toString('utf8', state.pos, state.pos + len)
    state.pos += len
    return str
  }

  // Inline data (0x70–0x90, length = byte - 0x70)
  if (type >= 0x70 && type <= 0x90) {
    const len = type - 0x70
    const data = state.buf.subarray(state.pos, state.pos + len)
    state.pos += len
    return data
  }

  // Data with length prefix
  if (type === 0x91) {
    const len = state.buf[state.pos++]
    const data = state.buf.subarray(state.pos, state.pos + len)
    state.pos += len
    return data
  }
  if (type === 0x92) {
    const len = state.buf.readUInt16LE(state.pos)
    state.pos += 2
    const data = state.buf.subarray(state.pos, state.pos + len)
    state.pos += len
    return data
  }
  if (type === 0x93) {
    const len = state.buf.readUInt32LE(state.pos)
    state.pos += 4
    const data = state.buf.subarray(state.pos, state.pos + len)
    state.pos += len
    return data
  }

  // Inline arrays (0xd0–0xdf)
  if (type >= 0xd0 && type <= 0xdf) {
    const count = type - 0xd0
    const arr = []
    for (let i = 0; i < count; i++) {
      arr.push(_decode(state))
    }
    return arr
  }

  // Inline dicts (0xe0–0xef)
  if (type >= 0xe0 && type <= 0xef) {
    const count = type - 0xe0
    const obj = {}
    for (let i = 0; i < count; i++) {
      const key = _decode(state)
      const val = _decode(state)
      obj[key] = val
    }
    return obj
  }

  throw new Error(`Unknown OPACK type: 0x${type.toString(16)} at pos ${state.pos - 1}`)
}

module.exports = { encode, decode }
