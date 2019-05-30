const AccessControl = require('accesscontrol')

const debug = require('debug')('iios:accesscontrol')

const ConnectorFactory = require('../connectors').ConnectorFactory

class IIOSAccesControl {
  constructor(options) {
    this._options = this._options || {}
    this._options.connector = this._options.connector || {
      redis: {
        host: '127.0.0.1',
        port: 6379,
        db: 1,
        ipFamily: 4
      }
    }

    this._ac = new AccessControl({})
    this._users = {}
    this._roles = {}

    try {
      // default to first in the dico
      let connectorType = Object.keys(this._options.connector)[0]

      this._connector = (new ConnectorFactory())
        .getConnectorInstance(connectorType,
          this._options.connector[connectorType])
    } catch (err) {
      debug('failed to get connector with error %o. exiting...', err)
      process.exit(1)
    }
  }

  init() {
    return new Promise(async (resolve, reject) => {
      try {
        await this._syncGrants()
        resolve()
      } catch (err) {
        reject(err)
      }
    })
  }

  _syncGrants() {
    return new Promise(async (resolve, reject) => {
      try {
        let keys = await this._connector.keys('__role:*')
        let rolesList = await this._connector.mget(keys)
        let roles = {}

        for (let role of keys) {
          roles[role.replace('__role:', '')] = rolesList.shift()
        }

        debug('set grants for roles %j', roles)

        this._ac.setGrants(roles)
        resolve(roles)
      } catch (err) {
        reject(err)
      }
    })
  }

  rolePermission(role, ressource, action) {
    return this._ac.can(role)[action](ressource)
  }

  userPermission(userId, ressource, action) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this._users[userId]) {
          this._users[userId] = await this._connector.get('__user:' + userId)
          this._users[userId] = this._users[userId] || 'anonymous'
        }

        let role = this._users[userId]

        resolve(this._ac.can(role)[action](ressource))
      } catch (err) {
        reject(err)
      }
    })
  }

  destroy() {
    return this._connector.destroy()
  }
}

exports.IIOSAccesControl = IIOSAccesControl
