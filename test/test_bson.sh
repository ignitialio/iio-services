#!/bin/sh

# export DEBUG=iios:*
export ENCODER=bson
export IIOS_NAMESPACE=testings
docker-compose up > test/logs/test-bson.log 2>&1 &
sleep 60
docker-compose stop alice bob ted
docker-compose rm -f alice bob ted
sleep 1
docker-compose stop redis
docker-compose rm -f redis
