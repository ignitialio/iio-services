module.exports = {
  /* service name */
  name: process.env.SERVICE_NAME,
  /* eventually disables pub/sub calling mechanism in order to use only HTTP */
  pubsubRPC: process.env.PUBSUB_RPC,
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
    path: './dist'
  },
  /* options published through discovery mechanism */
  publicOptions: {
    myOption: 'toto'
  }
}
