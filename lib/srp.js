const crypto = require('crypto')

// HAP uses 3072-bit prime
const N_HEX =
  'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AAAC42DAD33170D04507A33A85521ABDF1CBA64ECFB850458DBEF0A8AEA71575D060C7DB3970F85A6E1E4C7ABF5AE8CDB0933D71E8C94E04A25619DCEE3D2261AD2EE6BF12FFA06D98A0864D87602733EC86A64521F2B18177B200CBBE117577A615D6C770988C0BAD946E208E24FA074E5AB3143DB5BFCE0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFF'
const N = BigInt('0x' + N_HEX)
const g = BigInt(5)

function bigintToBuffer(n, length) {
  let hex = n.toString(16)
  if (hex.length % 2) hex = '0' + hex
  const buf = Buffer.from(hex, 'hex')
  if (length && buf.length < length) {
    return Buffer.concat([Buffer.alloc(length - buf.length), buf])
  }
  return buf
}

function bufferToBigint(buf) {
  return BigInt('0x' + buf.toString('hex'))
}

function sha512(...buffers) {
  const hash = crypto.createHash('sha512')
  for (const buf of buffers) {
    hash.update(buf)
  }
  return hash.digest()
}

function computeK() {
  // k = H(N | PAD(g))
  const nBuf = bigintToBuffer(N)
  const gBuf = bigintToBuffer(g, nBuf.length)
  return bufferToBigint(sha512(nBuf, gBuf))
}

function computeX(salt, identity, password) {
  // x = H(salt | H(identity | ":" | password))
  const inner = sha512(Buffer.from(identity + ':' + password))
  return bufferToBigint(sha512(salt, inner))
}

function modPow(base, exp, mod) {
  let result = BigInt(1)
  base = base % mod
  while (exp > 0) {
    if (exp % BigInt(2) === BigInt(1)) {
      result = (result * base) % mod
    }
    exp = exp / BigInt(2)
    base = (base * base) % mod
  }
  return result
}

class SRPClient {
  constructor(identity, password) {
    this.identity = identity
    this.password = password
    this.k = computeK()

    // Generate private key a (random 256 bits)
    this.a = bufferToBigint(crypto.randomBytes(32))

    // Compute public key A = g^a mod N
    this.A = modPow(g, this.a, N)
  }

  getPublicKey() {
    return bigintToBuffer(this.A, 384)
  }

  computeSharedSecret(salt, serverPublicKey) {
    this.salt = salt
    const B = bufferToBigint(serverPublicKey)

    // Verify B % N != 0
    if (B % N === BigInt(0)) {
      throw new Error('Invalid server public key')
    }

    const ABuf = bigintToBuffer(this.A, 384)
    const BBuf = bigintToBuffer(B, 384)

    // u = H(A | B)
    const u = bufferToBigint(sha512(ABuf, BBuf))
    if (u === BigInt(0)) {
      throw new Error('Invalid u value')
    }

    // x = H(salt | H(identity | ":" | password))
    const x = computeX(salt, this.identity, this.password)

    // S = (B - k * g^x) ^ (a + u * x) mod N
    const gx = modPow(g, x, N)
    let base = (B - this.k * gx) % N
    if (base < 0) base += N

    const exp = (this.a + u * x) % (N - BigInt(1))
    const S = modPow(base, exp, N)

    // K = H(S) — no padding of S (pyatv/srptools convention)
    this.K = sha512(bigintToBuffer(S))
    this.S = S

    return this.K
  }

  computeProof(serverPublicKey) {
    const ABuf = bigintToBuffer(this.A, 384)
    const BBuf = serverPublicKey

    // M1 = H(H(N) XOR H(g) | H(identity) | salt | A | B | K)
    const hN = sha512(bigintToBuffer(N))
    const hg = sha512(bigintToBuffer(g)) // hash raw g bytes ([0x05]), not padded to 384
    const hNxorHg = Buffer.alloc(64)
    for (let i = 0; i < 64; i++) {
      hNxorHg[i] = hN[i] ^ hg[i]
    }

    const hI = sha512(Buffer.from(this.identity))

    this.M1 = sha512(hNxorHg, hI, this.salt, ABuf, BBuf, this.K)
    return this.M1
  }

  verifyServerProof(serverProof) {
    // M2 = H(A | M1 | K)
    const ABuf = bigintToBuffer(this.A, 384)
    const expectedM2 = sha512(ABuf, this.M1, this.K)
    return serverProof.equals(expectedM2)
  }

  getSessionKey() {
    return this.K
  }
}

module.exports = { SRPClient }
