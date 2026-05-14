const AppleTVDiscovery = require('./lib/appletv')

async function main() {
  const discovery = new AppleTVDiscovery({ debug: true })
  await discovery.ready()

  discovery.on('service', (device) => {
    console.log('Found:', device.name, device.address)
  })

  const devices = await discovery.discover({ first: true })
  console.log('All Apple TVs:', devices)

  await discovery.close()
}

main()
