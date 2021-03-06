#!/bin/sh

#export DEBUG=iios:*
export STREAMING=true
export IIOS_NAMESPACE=testings
docker-compose up alice bob redis > test/logs/test-streams.log 2>&1 &
sleep 20
docker-compose stop alice bob
docker-compose rm -f alice bob
sleep 1
docker-compose stop redis
docker-compose rm -f redis
