#!/bin/sh
set -eu
mkdir -p /app/data/meta
chown node:node /app/data /app/data/meta
chmod 700 /app/data/meta
exec runuser -u node -- node /app/src/server.mjs
