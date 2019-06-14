#!/bin/sh

#export DEBUG=iios:*
export PUBSUB_RPC=false
export IIOS_NAMESPACE=testings
docker-compose up > test-services-http.log 2>&1 &
sleep 30
docker-compose stop
docker-compose rm -f
