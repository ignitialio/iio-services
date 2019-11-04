const should = require('should')
const chalk = require('chalk')

const IIOSAccesControl = require('../lib/accesscontrol').IIOSAccesControl

let ac = new IIOSAccesControl({ namespace: process.env.IIOS_NAMESPACE || 'testings' })

ac.init().then(async () => {
  console.log(chalk.green('acces control initialized ✔'))

  let permission = await ac.userPermission('gcrood', 'bob', 'createAny')

  try {
    (permission.granted).should.be.true()
    console.log(chalk.green('gcrood on bob permission ✔'))
  } catch (err) {
    console.log(chalk.red('gcrood on bob permission ✘'))
    console.log(permission)
  }

  permission = await ac.userPermission('tcrood', 'default', 'createAny')

  try {
    (permission.granted).should.be.false()
    console.log(chalk.green('tcrood on default permission ✔'))
  } catch (err) {
    console.log(chalk.red('tcrood on default permission ✘'))
    console.log(permission)
  }

  permission = await ac.userPermission('anonymous', 'dlake:users', 'createAny')

  try {
    (permission.granted).should.be.false()
    console.log(chalk.green('anonymous on dlake:users any permission ✔'))
  } catch (err) {
    console.log(chalk.red('anonymous on dlake:users any permission ✘'))
    console.log(permission)
  }

  permission = await ac.userPermission('anonymous', 'ted', 'readOwn')

  try {
    (permission.granted).should.be.true()
    console.log(chalk.green('anonymous on ted own permission ✔'))
  } catch (err) {
    console.log(chalk.red('tcrood on ted own  permission ✘'))
    console.log(permission)
  }

  let roles = await ac.getRoles()

  try {
    roles.should.containDeep([ '__role:testings:user' ])
    console.log(chalk.green('get roles ✔'))
  } catch (err) {
    console.log(chalk.red('get roles ✘'))
    console.log(roles)
  }

  let fullConfig = await ac.getRolesAndGrants()

  try {
    fullConfig.admin.bob['read:any'].should.containDeep([ '*' ])
    console.log(chalk.green('get full config ✔'))
  } catch (err) {
    console.log(chalk.red('get full config ✘'))
    console.log(fullConfig)
  }

  await ac.destroy()
}).catch(err => {
  console.log(chalk.red('acces control initialized ✘'))
  console.log(err)
})
