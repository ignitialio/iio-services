module.exports = {
  /* service name */
  name: 'alice',
  /* eventually disables pub/sub calling mechanism in order to use only HTTP */
  pubsubRPC: process.env.PUBSUB_RPC,
  /* discovery servers (gateways) when HTTP only */
  discoveryServers: [],
  /* calling timeout for pub/sub mode */
  timeout: 500,
  /* metrics configuration: no metrics if undefined */
  metrics: {
    /* number of points that triggers metrics push event */
    pushTrigger: 100,
    /* maw number of points to store locally */
    maxPoints: 100
  },
  /* PUB/SUB/KV connector */
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
    /* server host for external call */
    host: process.env.IIOS_SERVER_HOST,
    /* server port */
    port: process.env.IIOS_SERVER_PORT,
    /* path to statically serve (at least one asset for icons for example) */
    path: './dist'
  },
  /* options published through discovery mechanism */
  publicOptions: {}
}
