module.exports = {
  name: 'alice',
  pubsubRPC: process.env.PUBSUB_RPC,
  discoveryServers: [],
  timeout: 500,
  /* PUB/SUB/KV connector*/
  connector: {
    /* redis server connection */
    redis: {
      host: process.env.REDIS_HOST,
      port: 6379,
      db: 0,
      ipFamily: 4
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
  publicOptions: {}
}
