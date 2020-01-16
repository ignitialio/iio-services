module.exports = {
  /* service name */
  name: process.env.SERVICE_NAME,
  /* eventually only use HTTP (degraded mode), so no push events */
  kvStoreMode: process.env.KV_STORE_MODE,
  /* uses HTTP for RPC calls, instead of pub/sub: default for ^3.0.0  */
  httpRPC: process.env.HTTP_RPC,
  /* discovery servers (gateways) when HTTP only */
  discoveryServers: [
    {
      /* server host */
      host: 'alice',
      /* server port */
      port: 20991
    }
  ],
  /* PUB/SUB/KV connector*/
  connector: {
    /* redis server connection */
    redis: {
      /* encoder to be used for packing/unpacking raw messages */
      encoder: process.env.ENCODER || 'json',
      host: process.env.REDIS_HOST,
      port: 6379,
      db: 0,
      ipFamily: 4
    }
  },
  /* access control: if present, acces control enabled */
  accesscontrol: {
    /* grants for current service: auto-fill */
    /* grants: {
      admin: {
        'create:any': [ '*' ],
        'read:any': [ '*' ],
        'update:any': [ '*' ],
        'delete:any': [ '*' ]
      },
      user: {
        'read:any': [ '*' ],
        'update:any': [ '*' ],
        'delete:any': [ '*' ]
      },
      anonymous: {
        'read:any': [ '*' ]
      }
    }, */
    /* access control namespace */
    namespace: process.env.IIOS_NAMESPACE || 'iios',
    /* connector configuration: optional, default same as global connector, but
       on DB 1 */
    connector: {
      /* redis server connection */
      redis: {
        host: process.env.REDIS_HOST,
        port: 6379,
        db: 1,
        ipFamily: 4
      }
    }
  },
  /* service namesapce */
  namespace: process.env.IIOS_NAMESPACE || 'iios',
  /* HTTP server declaration */
  server: {
    /* server host */
    host: process.env.IIOS_SERVER_HOST,
    /* server port */
    port: process.env.IIOS_SERVER_PORT,
    /* path to statically serve (at least one asset for icons for example) */
    path: './dist',
    /* log level for http requests */
    restLogLevel: 'error'
  },
  /* options published through discovery mechanism */
  publicOptions: {
    myOption: 'toto'
  }
}
