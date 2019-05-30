#!/bin/sh

export DEBUG=-removethis-iios:*
docker-compose up > test-services.log 2>&1 &
sleep 30
docker-compose stop
docker-compose rm -f
