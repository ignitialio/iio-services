module.exports = {
  admin: {
    'default': {
      'create:any': [ '*' ],
      'read:any': [ '*' ],
      'update:any': [ '*' ],
      'delete:any': [ '*' ]
    },
    'dlake:users': {
      'create:any': [ '*' ],
      'read:any': [ '*' ],
      'update:any': [ '*' ],
      'delete:any': [ '*' ]
    },
    'bob': {
      'create:any': [ '*' ],
      'read:any': [ '*' ],
      'update:any': [ '*' ],
      'delete:any': [ '*' ]
    },
    'ted': {
      'create:any': [ '*' ],
      'read:any': [ '*' ],
      'update:any': [ '*' ],
      'delete:any': [ '*' ]
    }
  },
  user: {
    'default': {
      'read:any': [ '*' ]
    },
    'dlake:users': {
      'read:any': [ '*' ],
      'update:own': [ '*' ],
      'delete:own': [ '*' ]
    },
    'bob': {
      'read:any': [ '*' ],
      'update:any': [ '*' ],
      'delete:any': [ '*' ]
    },
    'ted': {
      'create:any': [ '*' ],
      'read:any': [ '*' ],
      'update:any': [ '*' ],
      'delete:any': [ '*' ]
    }
  },
  anonymous: {
    'default': {
      'read:any': [ '*' ]
    },
    'dlake:users': {
      'read:any': [ '_id', 'role', 'firstname', 'lastname', 'avatar' ]
    },
    'bob': {
      'read:any': [ '*' ]
    },
    'ted': {
      'read:own': [ '*' ]
    }
  }
}
