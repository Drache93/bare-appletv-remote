const { verify } = require('./verify')
const { Session } = require('./session')
const { wake } = require('./wol')

// releaseOnly: action triggers on key-up edge only (no press event)
const HID = {
  sleep: { keycode: 12, releaseOnly: true },
  playPause: { keycode: 14, releaseOnly: false },
  menu: { keycode: 5, releaseOnly: false },
  back: { keycode: 5, releaseOnly: false },
  home: { keycode: 7, releaseOnly: false },
  volumeUp: { keycode: 8, releaseOnly: false },
  volumeDown: { keycode: 9, releaseOnly: false },
  up: { keycode: 1, releaseOnly: false },
  down: { keycode: 2, releaseOnly: false },
  left: { keycode: 3, releaseOnly: false },
  right: { keycode: 4, releaseOnly: false },
  click: { keycode: 6, releaseOnly: false }
}

const TouchPhase = { began: 1, moved: 3, ended: 4 }

// Establish a verified session and send init messages.
// Returns a handle: { conn, session, nextTxn(), close() }
async function openSession(creds, debug) {
  const { conn, readKey, writeKey } = await verify(creds.address, creds.port, creds, debug)
  const session = new Session(conn, readKey, writeKey)
  let txn = 1

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
  session.send({
    _i: '_touchStart',
    _t: 2,
    _x: txn++,
    _c: { _height: 1000, _tFl: 0, _width: 1000 }
  })
  const sid = Math.floor(Math.random() * 0xffffffff)
  session.send({
    _i: '_sessionStart',
    _t: 2,
    _x: txn++,
    _c: { _srvT: 'com.apple.tvremoteservices', _sid: sid }
  })

  await new Promise((r) => setTimeout(r, 50))

  // The ATV drops idle Companion sockets after ~30s
  const keepalive = setInterval(() => {
    session.send({ _i: 'FetchAttentionState', _t: 2, _x: txn++, _c: {} })
  }, 25000)
  conn.once('close', () => clearInterval(keepalive))

  return { conn, session, nextTxn: () => txn++, close: () => session.close() }
}

function sendHID(handle, hid) {
  const { session, nextTxn } = handle
  if (hid.releaseOnly) {
    session.send({ _i: '_hidC', _t: 2, _x: nextTxn(), _c: { _hBtS: 2, _hidC: hid.keycode } })
  } else {
    session.send({ _i: '_hidC', _t: 2, _x: nextTxn(), _c: { _hBtS: 1, _hidC: hid.keycode } })
    session.send({ _i: '_hidC', _t: 2, _x: nextTxn(), _c: { _hBtS: 2, _hidC: hid.keycode } })
  }
}

function sendAppLaunch(handle, bundleId) {
  handle.session.send({
    _i: '_launchApplication',
    _t: 2,
    _x: handle.nextTxn(),
    _c: { _bundleID: bundleId }
  })
}

function sendTouchStartEvent(handle) {
  handle.session.send({
    _i: '_touchStart',
    _t: 2,
    _x: handle.nextTxn(),
    _c: { _height: 1000, _tFl: 0, _width: 1000 }
  })

  return Date.now()
}

function sendTouchEvent(handle, x, y, phase, elapsedMs) {
  handle.session.send({
    _i: '_hidT',
    _t: 1,
    _x: handle.nextTxn(),
    _c: { _cx: Math.round(x), _cy: Math.round(y), _tPh: phase, _tFg: 1, _ns: elapsedMs * 1_000_000 }
  })
}

function sendTouchEndEvent(handle) {
  handle.session.send({
    _i: '_touchStop',
    _t: 2,
    _x: handle.nextTxn(),
    _c: { _i: 1 }
  })
}

// One-shot helper used by the CLI: open, send, wait, close.
async function runHID(creds, hid, debug) {
  const handle = await openSession(creds, debug)
  sendHID(handle, hid)
  await new Promise((r) => setTimeout(r, 300))
  await handle.close()
}

async function sleep(creds, debug) {
  await runHID(creds, HID.sleep, debug)
}
async function playPause(creds, debug) {
  await runHID(creds, HID.playPause, debug)
}
async function menu(creds, debug) {
  await runHID(creds, HID.menu, debug)
}
async function back(creds, debug) {
  await runHID(creds, HID.back, debug)
}
async function home(creds, debug) {
  await runHID(creds, HID.home, debug)
}
async function settings(creds, debug) {
  const handle = await openSession(creds, debug)
  sendAppLaunch(handle, 'com.apple.TVSettings')
  await new Promise((r) => setTimeout(r, 300))
  await handle.close()
}
async function volumeUp(creds, debug) {
  await runHID(creds, HID.volumeUp, debug)
}
async function volumeDown(creds, debug) {
  await runHID(creds, HID.volumeDown, debug)
}
async function up(creds, debug) {
  await runHID(creds, HID.up, debug)
}
async function down(creds, debug) {
  await runHID(creds, HID.down, debug)
}
async function left(creds, debug) {
  await runHID(creds, HID.left, debug)
}
async function right(creds, debug) {
  await runHID(creds, HID.right, debug)
}
async function click(creds, debug) {
  await runHID(creds, HID.click, debug)
}

async function wakeDevice(creds) {
  if (!creds.mac) throw new Error('No MAC address in credentials — re-pair to capture it')
  await wake(creds.mac, creds.address)
}

module.exports = {
  HID,
  TouchPhase,
  openSession,
  sendHID,
  sendTouchStartEvent,
  sendTouchEvent,
  sendTouchEndEvent,
  sendAppLaunch,
  sleep,
  playPause,
  menu,
  back,
  home,
  settings,
  volumeUp,
  volumeDown,
  up,
  down,
  left,
  right,
  click,
  wakeDevice
}
