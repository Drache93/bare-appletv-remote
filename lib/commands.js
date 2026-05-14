const { verify } = require('./verify')
const { Session } = require('./session')
const { wake } = require('./wol')

// HID keycodes per Companion protocol (source: appletv-remote reference)
// releaseOnly: sleep/wake trigger on the release edge only (no press event)
const HID = {
  sleep: { keycode: 12, releaseOnly: true },
  playPause: { keycode: 14, releaseOnly: false },
  back: { keycode: 5, releaseOnly: false }
}

async function runHID(creds, hid, debug) {
  const { conn, readKey, writeKey } = await verify(creds.address, creds.port, creds, debug)
  const session = new Session(conn, readKey, writeKey)
  let txn = 1

  // Session init: _systemInfo → _touchStart → _sessionStart
  session.send({
    _i: '_systemInfo',
    _t: 2,
    _x: txn++,
    _c: {
      _bf: 0,
      _cf: 512,
      _clFl: 128,
      _i: creds.clientId,
      _idsID: Buffer.from(creds.clientId),
      _pubID: creds.clientId,
      _sf: 256,
      _sv: '170.18',
      model: 'MacBookPro',
      name: creds.name || 'Bare Remote'
    }
  })
  session.send({ _i: '_touchStart', _t: 2, _x: txn++, _c: { _height: 1000, _tFl: 0, _width: 1000 } })
  const sid = Math.floor(Math.random() * 0xffffffff)
  session.send({
    _i: '_sessionStart',
    _t: 2,
    _x: txn++,
    _c: { _srvT: 'com.apple.tvremoteservices', _sid: sid }
  })

  // 50ms grace for session establishment before sending HID
  await new Promise((r) => setTimeout(r, 50))

  if (hid.releaseOnly) {
    session.send({ _i: '_hidC', _t: 2, _x: txn++, _c: { _hBtS: 2, _hidC: hid.keycode } })
  } else {
    session.send({ _i: '_hidC', _t: 2, _x: txn++, _c: { _hBtS: 1, _hidC: hid.keycode } })
    session.send({ _i: '_hidC', _t: 2, _x: txn++, _c: { _hBtS: 2, _hidC: hid.keycode } })
  }

  await new Promise((r) => setTimeout(r, 300))
  await session.close()
}

async function sleep(creds, debug) {
  await runHID(creds, HID.sleep, debug)
}

async function playPause(creds, debug) {
  await runHID(creds, HID.playPause, debug)
}

async function back(creds, debug) {
  await runHID(creds, HID.back, debug)
}

async function wakeDevice(creds) {
  if (!creds.mac) throw new Error('No MAC address in credentials — re-pair to capture it')
  await wake(creds.mac, creds.address)
}

module.exports = { sleep, playPause, back, wakeDevice }
