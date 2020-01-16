#!/bin/sh

#export DEBUG=iios:*
export IIOS_NAMESPACE=testings
export IIOS_TRACE_RPC=true
# export DEBUG=iios:service
docker-compose up > test/logs/test-services.log 2>&1 &
sleep 60
docker-compose stop alice bob ted
docker-compose rm -f alice bob ted
sleep 1
docker-compose stop redis
docker-compose rm -f redis
