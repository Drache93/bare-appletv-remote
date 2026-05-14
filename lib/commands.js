const { verify } = require('./verify')
const { Session } = require('./session')
const { wake } = require('./wol')

// HID page / usage for sleep toggle
const HID_PAGE_GENERIC_DESKTOP = 1
const HID_USAGE_SYSTEM_SLEEP = 0x82

async function sleep(creds, debug) {
  const { conn, readKey, writeKey } = await verify(creds.address, creds.port, creds, debug)
  const session = new Session(conn, readKey, writeKey)

  const ts = Date.now() / 1000

  // Press and release the sleep button
  session.send({
    _i: 'FamilyRemoteInput',
    _x: 1,
    _t: ts,
    _c: {
      _hidc: [
        {
          _kHIDPage: HID_PAGE_GENERIC_DESKTOP,
          _kHIDUsage: HID_USAGE_SYSTEM_SLEEP,
          _kHIDDown: true
        },
        {
          _kHIDPage: HID_PAGE_GENERIC_DESKTOP,
          _kHIDUsage: HID_USAGE_SYSTEM_SLEEP,
          _kHIDDown: false
        }
      ]
    }
  })

  // Give the frame time to flush before closing
  await new Promise((r) => setTimeout(r, 300))
  await session.close()
}

async function wakeDevice(creds) {
  if (!creds.mac) throw new Error('No MAC address in credentials — re-pair to capture it')
  await wake(creds.mac)
}

module.exports = { sleep, wakeDevice }
