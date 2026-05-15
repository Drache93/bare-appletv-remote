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
    await remote.close()
    console.log('Done.')
  },
  async play() {
    await remote.playPause()
    await remote.close()
    console.log('Done.')
  },
  async back() {
    await remote.back()
    await remote.close()
    console.log('Done.')
  },
  async home() {
    await remote.home()
    await remote.close()
    console.log('Done.')
  },
  async settings() {
    await remote.settings()
    await remote.close()
    console.log('Done.')
  },
  async volup() {
    await remote.volumeUp()
    await remote.close()
    console.log('Done.')
  },
  async voldown() {
    await remote.volumeDown()
    await remote.close()
    console.log('Done.')
  },
  async up() {
    await remote.up()
    await remote.close()
    console.log('Done.')
  },
  async down() {
    await remote.down()
    await remote.close()
    console.log('Done.')
  },
  async left() {
    await remote.left()
    await remote.close()
    console.log('Done.')
  },
  async right() {
    await remote.right()
    await remote.close()
    console.log('Done.')
  },
  async click() {
    await remote.click()
    await remote.close()
    console.log('Done.')
  },
  async wake() {
    await remote.wake()
    await remote.close()
    console.log('Wake packet sent.')
  },
  async swipeleft() {
    await remote.swipe('left')
    await remote.close()
    console.log('Done.')
  },
  async swiperight() {
    await remote.swipe('right')
    await remote.close()
    console.log('Done.')
  },
  async swipeup() {
    await remote.swipe('up')
    await remote.close()
    console.log('Done.')
  },
  async swipedown() {
    await remote.swipe('down')
    await remote.close()
    console.log('Done.')
  }
}

if (!cmd || !commands[cmd]) {
  console.log(
    'Usage: appletv <pair|sleep|play|back|home|settings|volup|voldown|up|down|left|right|click|wake|swipeleft|swiperight|swipeup|swipedown>'
  )
  process.exit(1)
}

commands[cmd]().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
