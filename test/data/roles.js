module.exports = {
  __privileged__: {
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
      'create:any': [ '*' ]
    }
  },
  admin: {
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
