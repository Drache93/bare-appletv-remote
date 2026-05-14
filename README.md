# bare-appletv-remote

Apple TV remote control library for the [Bare](https://github.com/holepunchto/bare) runtime

Controls Apple TV via the **Companion Link** protocol — the same protocol used by the iOS Remote app. Handles discovery, pairing, session encryption, and remote commands including navigation, playback, touch gestures, and power.

## Install

```bash
npm install bare-appletv-remote
```

## Usage

### As a library

```js
const AppleTVRemote = require('bare-appletv-remote')

// First run: scans the network, pairs (showing a PIN on the TV screen),
// and saves credentials to ~/.appletv-credentials.json automatically.
// Subsequent runs: loads credentials from disk silently.
const remote = new AppleTVRemote({
  onpin: async () => {
    // called only when pairing is needed — return the PIN shown on screen
    return myPromptFunction('Enter the PIN shown on the Apple TV: ')
  }
})

await remote.ready()

// Navigation
await remote.up()
await remote.down()
await remote.left()
await remote.right()
await remote.click()      // select focused item
await remote.menu()       // menu / back button
await remote.back()       // alias for menu()

// Playback
await remote.playPause()

// Volume
await remote.volumeUp()
await remote.volumeDown()

// Power
await remote.sleep()
await remote.wake()       // Wake-on-LAN (requires Ethernet on the Apple TV)

// Touch gestures — coordinates are on a 0–1000 × 0–1000 surface
await remote.swipe('right')           // fast-forward
await remote.swipe('left')            // rewind
await remote.swipe('right', { distance: 500, steps: 20 })

// Low-level touch — useful for custom UI or continuous scrubbing
await remote.touchBegin(500, 500)
await remote.touchMove(700, 500)
await remote.touchEnd(700, 500)

await remote.close()
```

The session connection is established during `ready()` and kept open for the lifetime of the remote. If the Apple TV drops the connection (e.g. after a long idle or on sleep), it is re-established transparently on the next command.

### Options

| Option            | Type                              | Default                            | Description                                                                                     |
| ----------------- | --------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| `onpin`           | `() => Promise<string> \| string` | —                                  | Called when pairing is needed. Return the PIN shown on screen. Required for first-time pairing. |
| `credentials`     | `Credentials`                     | —                                  | Pass credentials directly, bypassing disk.                                                      |
| `credentialsFile` | `string`                          | `~/.appletv-credentials.json`      | Override the credentials file path.                                                             |
| `host`            | `string`                          | —                                  | Skip mDNS discovery and connect directly to this IP address.                                    |
| `port`            | `number`                          | —                                  | Port to use when `host` is set.                                                                 |
| `idleTimeout`     | `number`                          | `0`                                | Milliseconds of inactivity before the session is closed. Default keeps it open indefinitely.     |
| `debug`           | `boolean`                         | `false`                            | Log protocol traffic.                                                                           |

### Events

```js
remote.on('paired', () => console.log('Paired and saved.'))
remote.on('ready', () => console.log('Ready.'))
remote.on('close', () => console.log('Closed.'))
```

### CLI

```bash
npm install -g bare-appletv-remote
```

```bash
# First run: scans, pairs, saves credentials
appletv pair

# Navigation
appletv up | down | left | right | click

# Playback & volume
appletv play
appletv volup | voldown

# Menu
appletv back

# Power
appletv sleep
appletv wake
```

### Pairing troubleshooting

When pairing is initiated the Apple TV should display a PIN automatically. If nothing appears on screen:

1. **Wake the TV first.** The PIN dialog only appears when the TV is active. Press a button on the physical Siri Remote to wake it, then run `pair` again.

2. **The PIN appears as an overlay anywhere.** It will appear over full-screen apps, the home screen, or even during video playback — you do not need to navigate to a specific screen first.

3. **Enable remote access.** On the Apple TV go to **Settings → AirPlay & HomeKit** and make sure **Allow Access** is not set to _No One_.

4. **Remove a stale pairing.** If the TV silently rejects the request (no PIN shown, but the handshake completes), a leftover pairing entry may be blocking it. On the Apple TV go to **Settings → AirPlay & HomeKit → Remote App and Devices** (or **Settings → Remotes and Devices → Remote App and Devices**) and remove any existing entry for this device, then pair again.

5. **Delete local credentials and retry.** If `~/.appletv-credentials.json` exists from a previous attempt that did not complete, delete it before running `pair` again.

### Advanced: scan and pair manually

```js
const AppleTVRemote = require('bare-appletv-remote')

// Scan the network for Apple TVs
const devices = await AppleTVRemote.scan()
console.log(devices[0].name, devices[0].address)

// Pair with a specific device
const credentials = await AppleTVRemote.pair(devices[0], async () => getPin())

// Use the credentials
const remote = new AppleTVRemote({ credentials })
await remote.up()
await remote.close()
```

## Protocol

Uses the **Companion Link** protocol (`_companion-link._tcp` mDNS service) with HAP (HomeKit Accessory Protocol) security:

- **Pairing**: SRP-6a (3072-bit) + Ed25519 long-term keys + ChaCha20-Poly1305
- **Sessions**: X25519 ephemeral DH + HKDF-SHA512 session keys
- **Commands**: Encrypted OPACK messages with HID event payloads
- **Touch**: `_touchUpdate` messages on a 1000×1000 virtual touchpad surface
- **Wake**: UDP Wake-on-LAN magic packet (MAC from mDNS `rpAD` TXT record)

Crypto via [`sodium-universal`](https://github.com/holepunchto/sodium-universal).

## License

MIT
