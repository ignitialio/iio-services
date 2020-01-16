#!/bin/sh

#export DEBUG=iios:*
export KV_STORE_MODE=false
export IIOS_NAMESPACE=testings
docker-compose up > test/logs/test-services-http.log 2>&1 &
sleep 30
docker-compose stop
docker-compose rm -f
