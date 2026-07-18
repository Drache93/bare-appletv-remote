const test = require('brittle')
const EventEmitter = require('bare-events')
const { Session } = require('../lib/session')
const { seal, open, counterNonce, TAG_LEN } = require('../lib/chacha')
const opack = require('../lib/opack')

const E_OPACK = 0x08

class FakeConn extends EventEmitter {
  constructor() {
    super()
    this.sent = []
  }

  send(type, payload) {
    this.sent.push({ type, payload })
  }

  close() {
    this.emit('close')
  }
}

function aad(payloadLen) {
  return Buffer.from([
    E_OPACK,
    (payloadLen >> 16) & 0xff,
    (payloadLen >> 8) & 0xff,
    payloadLen & 0xff
  ])
}

function deliver(conn, readKey, counter, obj) {
  const plain = opack.encode(obj)
  const payload = seal(readKey, counterNonce(counter), plain, aad(plain.length + TAG_LEN))
  conn.emit('frame', { type: E_OPACK, payload })
}

function decryptSent(writeKey, counter, { payload }) {
  return opack.decode(open(writeKey, counterNonce(counter), payload, aad(payload.length)))
}

test('session replies to _heartbeat and _ping without invoking the handler', function (t) {
  const conn = new FakeConn()
  const readKey = Buffer.alloc(32, 1)
  const writeKey = Buffer.alloc(32, 2)
  const session = new Session(conn, readKey, writeKey)

  const received = []
  session.onMessage((msg) => received.push(msg))

  deliver(conn, readKey, 0, { _i: '_heartbeat', _t: 2, _x: 7 })
  deliver(conn, readKey, 1, { _i: '_ping', _t: 2, _x: 8 })

  t.is(conn.sent.length, 2)
  t.alike(decryptSent(writeKey, 0, conn.sent[0]), { _i: '_heartbeat', _t: 3, _x: 7 })
  t.alike(decryptSent(writeKey, 1, conn.sent[1]), { _i: '_pong', _t: 3, _x: 8 })
  t.is(received.length, 0)

  deliver(conn, readKey, 2, { _i: '_iMC', _t: 1, _x: 9 })
  t.is(received.length, 1)
  t.is(received[0]._i, '_iMC')
})
