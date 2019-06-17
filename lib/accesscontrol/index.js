const AccessControl = require('accesscontrol')

const debug = require('debug')('iios:accesscontrol')

const ConnectorFactory = require('../connectors').ConnectorFactory

class IIOSAccesControl {
  constructor(options) {
    this._options = options || {}
    this._options.connector = this._options.connector || {
      redis: {
        host: '127.0.0.1',
        port: 6379,
        db: 1,
        ipFamily: 4
      }
    }

    this._options.namespace = this._options.namespace || 'iios'
    this._roleCollectionKeyPart = '__role:' + this._options.namespace
    this._userCollectionKeyPart = '__user:' + this._options.namespace

    this._ac = new AccessControl({})
    this._users = {}
    this._roles = {}

    try {
      // default to first in the dico
      let connectorType = Object.keys(this._options.connector)[0]

      debug('will connect to %o', this._options.connector[connectorType])
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
        await this.syncGrants()
        resolve()
      } catch (err) {
        reject(err)
      }
    })
  }

  setGrants(role, grants) {
    return this._connector.set(this._roleCollectionKeyPart + ':' + role, grants)
  }

  getGrants(role) {
    return this._connector.get(this._roleCollectionKeyPart + ':' + role)
  }

  setUserRole(user, role) {
    return this._connector.set(this._userCollectionKeyPart + ':' + user, role)
  }

  getUserRole(user) {
    return this._connector.get(this._userCollectionKeyPart + ':' + user)
  }

  syncGrants() {
    return new Promise(async (resolve, reject) => {
      try {
        let keys = await this._connector.keys(this._roleCollectionKeyPart + ':*')

        if (keys && keys.length > 0) {
          let rolesList = await this._connector.mget(keys)
          let roles = {}

          for (let role of keys) {
            roles[role.replace(this._roleCollectionKeyPart + ':', '')] =
              rolesList.shift()
          }

          debug('set grants for roles %j', roles)

          this._ac.setGrants(roles)
          resolve(roles)
        } else {
          resolve(null)
        }
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
        let role = 'anonymous'

        if (this._users[userId]) {
          role = this._users[userId]
        } else if (userId) {
          this._users[userId] =
            await this.getUserRole(userId)
          role = this._users[userId] = this._users[userId] || 'anonymous'
        }

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
