const chalk = require('chalk')
const fs = require('fs')
const path = require('path')
const Readable = require('stream').Readable

const config = require('./config')
const Bob = require('./bob.service')

function sleep(sec) {
  return new Promise((resolve, reject) => {
    setTimeout(() => resolve(), parseInt(sec) * 1000)
  })
}

sleep(process.env.DELAYED).then(() => {
  let bob = new Bob(config)
  bob._init().then(() => {
    console.log(chalk.green(process.env.SERVICE_NAME + ' service initialized ✔'))

    bob._pushEvent('coucou', { toto: 'titi' }).catch(err => {
      if (bob._options.kvStoreMode) console.log('connector not available')
    })

    try {
      if (process.env.STREAMING) {
        let stream = bob._addStream('ofs')
        let url = path.join(__dirname, './bob.service.js')
        let rfs = fs.createReadStream(url)

        rfs.on('open', () => {
          rfs.pipe(stream)
        })

        rfs.on('error', err => {
          console.log('----------------------------', err)
        })

        let datastream = bob._addStream('ojs')

        const rstream = new Readable({
          read() {}
        })

        rstream.pipe(datastream)

        rstream.push(JSON.stringify({ toto: 1, titi: 2 }))
        rstream.push('\u0000')
      }
    } catch (err) {
      console.log('----------------------------', err)
    }
  }).catch(err => console.log(chalk.red(process.env.SERVICE_NAME + ' service initialized ✘')))
})
