const sodium = require('sodium-universal')

const TAG_LEN = sodium.crypto_aead_chacha20poly1305_ietf_ABYTES // 16
const NONCE_LEN = sodium.crypto_aead_chacha20poly1305_ietf_NPUBBYTES // 12

// 12-byte nonce from a string label (HAP setup/verify nonces e.g. "PS-Msg05")
function labelNonce(label) {
  const nonce = Buffer.alloc(NONCE_LEN)
  const lb = Buffer.from(label)
  lb.copy(nonce, NONCE_LEN - lb.length)
  return nonce
}

// 12-byte nonce from an integer counter (session frames)
function counterNonce(n) {
  const nonce = Buffer.alloc(NONCE_LEN)
  nonce.writeBigUInt64LE(BigInt(n), 4)
  return nonce
}

function seal(key, nonce, plaintext, aad) {
  const out = Buffer.alloc(plaintext.length + TAG_LEN)
  sodium.crypto_aead_chacha20poly1305_ietf_encrypt(out, plaintext, aad || null, null, nonce, key)
  return out
}

function open(key, nonce, ciphertext, aad) {
  const out = Buffer.alloc(ciphertext.length - TAG_LEN)
  sodium.crypto_aead_chacha20poly1305_ietf_decrypt(out, null, ciphertext, aad || null, nonce, key)
  return out
}

module.exports = { seal, open, labelNonce, counterNonce, TAG_LEN }
