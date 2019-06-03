#!/bin/sh

#export DEBUG=iios:*
docker-compose up > test-services.log 2>&1 &
sleep 60
docker-compose stop alice bob ted
docker-compose rm -f alice bob ted
sleep 1
docker-compose stop redis
docker-compose rm -f redis
