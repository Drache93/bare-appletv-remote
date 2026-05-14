# bare-appletv-remote

Apple TV remote control library for the [Bare](https://github.com/holepunchto/bare) runtime

Controls Apple TV via the **Companion Link** protocol — the same protocol used by the iOS Remote app. Handles discovery, pairing, session encryption, and power commands.

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

// Put the TV to sleep
await remote.sleep()

// Wake via Wake-on-LAN (requires Ethernet connection on the Apple TV)
await remote.wake()

await remote.close()
```

### Options

| Option            | Type                              | Description                                                                                     |
| ----------------- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `onpin`           | `() => Promise<string> \| string` | Called when pairing is needed. Return the PIN shown on screen. Required for first-time pairing. |
| `credentials`     | `Credentials`                     | Pass credentials directly, bypassing disk.                                                      |
| `credentialsFile` | `string`                          | Override the credentials file path (default: `~/.appletv-credentials.json`).                    |
| `debug`           | `boolean`                         | Log protocol traffic.                                                                           |

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
baretv pair

# Put the TV to sleep
baretv sleep

# Wake-on-LAN
baretv wake
```

### Pairing troubleshooting

When pairing is initiated the Apple TV should display a PIN automatically. If nothing appears on screen:

1. **Wake the TV first.** The PIN dialog only appears when the TV is active. Press a button on the physical Siri Remote to wake it, then run `pair` again.

2. **Check the TV is on the home screen.** The dialog will not appear over the top of a full-screen app. Press the TV/home button to return to the home screen first.

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
await remote.sleep()
await remote.close()
```

## Protocol

Uses the **Companion Link** protocol (`_companion-link._tcp` mDNS service) with HAP (HomeKit Accessory Protocol) security:

- **Pairing**: SRP-6a (3072-bit) + Ed25519 long-term keys + ChaCha20-Poly1305
- **Sessions**: X25519 ephemeral DH + HKDF-SHA512 session keys
- **Commands**: Encrypted OPACK messages with HID event payloads
- **Wake**: UDP Wake-on-LAN magic packet (MAC from mDNS `rpAD` TXT record)

Crypto via [`sodium-universal`](https://github.com/holepunchto/sodium-universal).

## License

MIT
