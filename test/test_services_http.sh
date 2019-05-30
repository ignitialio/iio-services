#!/bin/sh

export DEBUG=-removethis-iios:*
#export DEBUG=iios:*
export PUBSUB_RPC=false
docker-compose up > test-services.log 2>&1 &
sleep 30
docker-compose stop
docker-compose rm -f
