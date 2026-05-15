#!/usr/bin/env bare
'use strict'

const tty = require('bare-tty')
const process = require('process')
const AppleTVRemote = require('../index')

function readPin() {
  return new Promise((resolve) => {
    const stdin = new tty.ReadStream(0)
    const stdout = new tty.WriteStream(1)
    stdout.write('Enter the PIN shown on the Apple TV: ')
    let answer = ''
    stdin.setMode(tty.constants.MODE_NORMAL)
    stdin.on('data', (data) => {
      const str = data.toString()
      const nl = str.indexOf('\n')
      const cr = str.indexOf('\r')
      const cut = nl !== -1 && cr !== -1 ? Math.min(nl, cr) : nl !== -1 ? nl : cr
      if (cut !== -1) {
        answer += str.slice(0, cut)
        stdin.destroy()
        stdout.write('\n')
        resolve(answer.trim())
      } else {
        answer += str
      }
    })
    stdin.resume()
  })
}

const remote = new AppleTVRemote({ onpin: readPin, debug: true })

remote.on('paired', () => console.log('Paired and credentials saved.'))

const [, , cmd] = process.argv

const commands = {
  async pair() {
    await remote.ready()
    console.log(`Ready: ${remote.name} (${remote.address})`)
    await remote.close()
  },
  async sleep() {
    await remote.sleep()
    await sleep()
    await remote.close()
    console.log('Done.')
  },
  async play() {
    await remote.playPause()
    await sleep()
    await remote.close()
    console.log('Done.')
  },
  async back() {
    await remote.back()
    await sleep()
    await remote.close()
    console.log('Done.')
  },
  async volup() {
    await remote.volumeUp()
    await sleep()
    await remote.close()
    console.log('Done.')
  },
  async voldown() {
    await remote.volumeDown()
    await sleep()
    await remote.close()
    console.log('Done.')
  },
  async up() {
    await remote.up()
    await sleep()
    await remote.close()
    console.log('Done.')
  },
  async down() {
    await remote.down()
    await sleep()
    await remote.close()
    console.log('Done.')
  },
  async left() {
    await remote.left()
    await sleep()
    await remote.close()
    console.log('Done.')
  },
  async right() {
    await remote.right()
    await sleep()
    await remote.close()
    console.log('Done.')
  },
  async click() {
    await remote.click()
    await sleep()
    await remote.close()
    console.log('Done.')
  },
  async wake() {
    await remote.wake()
    await sleep()
    await remote.close()
    console.log('Wake packet sent.')
  }
}

if (!cmd || !commands[cmd]) {
  console.log('Usage: appletv <pair|sleep|play|back|volup|voldown|up|down|left|right|click|wake>')
  process.exit(1)
}

commands[cmd]().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})

const sleep = () => new Promise((res) => setTimeout(res, 100))
