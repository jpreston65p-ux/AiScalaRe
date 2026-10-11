#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == --help ]]; then
  printf '%s\n' 'SCALA en Railway: bash VINCULAR_RAILWAY_MINT.sh [--revincular]' 'Inicia sesión en Railway, abre la consola privada del servidor y muestra el QR allí.'
  exit 0
fi
if (( $# > 1 )) || [[ "${1:-}" != '' && "${1:-}" != --revincular ]]; then
  printf '%s\n' 'Uso: bash VINCULAR_RAILWAY_MINT.sh [--revincular]'
  exit 2
fi
if [[ ! -t 0 || ! -t 1 ]]; then
  printf '%s\n' 'Ejecuta este archivo desde una terminal normal de Linux Mint; el QR necesita una terminal privada.'
  exit 2
fi
SCALA_NODE_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/scala-whatsapp/node24"
if [[ -x "$SCALA_NODE_DIR/bin/node" ]]; then
  export PATH="$SCALA_NODE_DIR/bin:$PATH"
fi
if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(".")[0]')" != 24 ]] || ! command -v npm >/dev/null 2>&1; then
  printf '%s\n' 'Se necesita Node.js 24. Ejecuta PREPARAR_SCALA_MINT.sh en tu carpeta SCALA_WHATSAPP_QR y vuelve a intentar.'
  exit 1
fi
if ! command -v ssh >/dev/null 2>&1; then
  printf '%s\n' 'Falta OpenSSH. Instálalo con: sudo apt install openssh-client'
  exit 1
fi
SCALA_RAILWAY=(npm exec --yes --package=@railway/cli@5.64.2 -- railway)
printf '%s\n' 'SCALA WhatsApp · Railway' 'Usa la misma cuenta de Railway que conectaste a ChatGPT. No pegues claves aquí.'
if ! "${SCALA_RAILWAY[@]}" whoami >/dev/null 2>&1; then
  "${SCALA_RAILWAY[@]}" login --browserless
fi
if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet scala-whatsapp-qr.service; then
  printf '%s\n' 'Deteniendo el bot local para evitar respuestas duplicadas con el servidor.'
  sudo systemctl stop scala-whatsapp-qr.service
fi
printf '%s\n' 'Abriendo el servidor. Railway puede pedir registrar una clave SSH la primera vez.'
if "${SCALA_RAILWAY[@]}" ssh \
  --project 86dc9c33-9042-48a9-8201-b94e04232179 \
  --service addfbe69-28c0-4ff7-91f2-9b045e49e633 \
  --environment 7da2eda3-0a63-4bb2-9b2f-d606f18a3987 \
  -- node scripts/vincular-nube.mjs "$@"; then
  printf '%s\n' 'Comprueba la atención desde otro número enviando hola. Cuando responda, puedes cerrar la terminal y apagar tu PC.'
else
  printf '%s\n' 'No se completó la conexión o vinculación. Conserva la terminal para revisar el error y vuelve a intentar.' 'Si necesitas recuperar temporalmente el bot local: sudo systemctl start scala-whatsapp-qr.service'
  exit 1
fi
