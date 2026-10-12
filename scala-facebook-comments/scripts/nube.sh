#!/bin/sh
set -eu
mkdir -p /app/data
chown node:node /app/data
case "${SCALA_FACEBOOK_HEADLESS:-1}" in
  0) exec runuser -u node -- xvfb-run -a -s '-screen 0 1280x720x24 -nolisten tcp' node /app/src/cloud-server.mjs ;;
  1) exec runuser -u node -- node /app/src/cloud-server.mjs ;;
  *) echo 'SCALA_CLOUD_BROWSER_FAILED: Modo del navegador inválido.'; exit 1 ;;
esac
