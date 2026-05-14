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
      if (str.includes('\n') || str.includes('\r')) {
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
  async wake() {
    await remote.wake()
    await remote.close()
    console.log('Wake packet sent.')
  }
}

if (!cmd || !commands[cmd]) {
  console.log('Usage: appletv <pair|sleep|wake>')
  process.exit(1)
}

commands[cmd]().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
