const IIOSAccesControl = require('../../lib/accesscontrol').IIOSAccesControl
const roles = require('../data/roles')
const users = require('../data/users')

async function populate() {
  console.log('create IIOS ac instance')
  let ac = new IIOSAccesControl({ namespace: process.env.IIOS_NAMESPACE })

  for (let role in roles) {
    console.log('sets role', role)
    await ac.setGrants(role, roles[role])
  }

  for (let user in users) {
    console.log('sets user', user)
    await ac.setUserRole(user, users[user])
  }

  ac._connector.destroy()
}

try {
  populate()
  console.log('done')
} catch (err) {
  console.log(err)
}
