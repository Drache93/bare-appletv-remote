# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run tests
node_modules/.bin/brittle test/*.js

# Run a single test file
node_modules/.bin/brittle test/messages.js

# Run the discovery entry point
node index.js

# Run the pairing debug script
node debug.js
```

There is no build step — this project runs directly as JS on the Bare runtime (no TypeScript compilation, no `dist/` output needed).

## Architecture

This is `bare-appletv-remote` — a rewrite of the original `node-appletv-x` (TypeScript + Node.js) targeting the **Bare runtime** (Holepunch/Pear stack). The goal is an Apple TV remote usable from any Pear app.

### Protocol stack

Two Apple TV protocols exist. This repo targets **Companion Link**, not MRP:

| Protocol                    | mDNS service           | Port         | Encoding | Status                                            |
| --------------------------- | ---------------------- | ------------ | -------- | ------------------------------------------------- |
| **Companion Link**          | `_companion-link._tcp` | varies (SRV) | OPACK    | **In use**                                        |
| Media Remote Protocol (MRP) | `_mediaremotetv._tcp`  | 49152        | Protobuf | Original lib; `lib/messages.js` skeleton in tests |

### Pairing sequence (HAP/SRP over Companion Link)

Frames are sent over TCP with a 4-byte header: `[type (1 byte)] [length BE (3 bytes)] [payload]`.

Frame types in `lib/companion.js`:

- `PS_START` / `PS_NEXT` (0x03/0x04) — Pairing Setup
- `PV_START` / `PV_NEXT` (0x05/0x06) — Pair Verify
- `E_OPACK` (0x08) — Encrypted OPACK

Full flow per connection:

1. **Pair** (one-time) — `lib/pairing.js`: SRP M1–M6, saves `~/.appletv-credentials.json`
2. **Verify** (every reconnect) — `lib/verify.js`: X25519 ephemeral DH, derives session read/write keys
3. **Session** — `lib/session.js`: wraps connection, encrypts/decrypts `E_OPACK` frames with ChaCha20-Poly1305 + counter nonce
4. **Commands** — `lib/commands.js`: `sleep()` sends HID System Sleep (page=1, usage=0x82); `wakeDevice()` sends WoL magic packet

### Crypto

All crypto uses **`sodium-universal`** (X25519 DH, Ed25519 sign/verify, ChaCha20-Poly1305 IETF). HKDF-SHA512 is implemented manually in `lib/hkdf.js` using `require('crypto').createHmac` (resolves to bare-crypto in Bare via the import map). TLV8 encoding is in `lib/tlv.js`.

Nonces: HAP setup/verify nonces are label strings right-padded into 12 bytes (e.g. `"PS-Msg05"` → 4 zero bytes + 8 ASCII). Session nonces are 8-byte LE counter at bytes 4–11.

### Key files

- `lib/appletv.js` — mDNS discovery; extends `bare-mdns-discovery`'s `Discovery` class; filters Apple TVs via `rpMd` TXT record; `rpAD` field is the MAC address (used for WoL)
- `lib/companion.js` — TCP socket + frame parser (`CompanionConnection extends ReadyResource`)
- `lib/opack.js` — Apple OPACK binary codec (Companion message payload)
- `lib/srp.js` — SRP-6a client; `computeSharedSecret` → `computeProof` → `verifyServerProof`; `getSessionKey()` returns 64-byte SHA-512 of shared secret
- `lib/tlv.js` — HAP TLV8 encode/decode; tag constants in `Tag`
- `lib/hkdf.js` — HKDF-SHA512 (extract + expand via HMAC)
- `lib/chacha.js` — `seal`/`open` wrappers; `labelNonce(str)` and `counterNonce(n)` builders
- `lib/pairing.js` — complete M1–M6 pair setup; exports `pair(host, port, getPinFn)`
- `lib/verify.js` — pair verify; exports `verify(host, port, creds)` → `{ conn, readKey, writeKey }`
- `lib/session.js` — encrypted session; `session.send(obj)`, `session.onMessage(fn)`, `session.decrypt(payload)`
- `lib/wol.js` — Wake-on-LAN via UDP broadcast; exports `wake(mac)`
- `lib/commands.js` — `sleep(creds)`, `wakeDevice(creds)`
- `bin/appletv.js` — CLI: `appletv pair | sleep | wake`
- `debug.js` — legacy pairing test (M1–M4 only, hardcoded IP)

### Bare runtime polyfill pattern

`package.json` `imports` maps Node built-ins to `bare-*` packages:

```json
"buffer" → "bare-buffer"
"crypto" → "bare-crypto"
"net"    → "bare-net"
```

Always `require('crypto')` etc. (not the bare package directly) so the import map resolves correctly in both Bare and Node.
