#!/usr/bin/env bash
set -euo pipefail
umask 077
source "$(dirname -- "${BASH_SOURCE[0]}")/scripts/entorno.sh"

SCALA_UPDATE_REVISION="${1:-scala-facebook-comentarios-cloud}"
if [[ "$SCALA_UPDATE_REVISION" != scala-facebook-comentarios-cloud && ! "$SCALA_UPDATE_REVISION" =~ ^[a-f0-9]{40}$ ]]; then
  printf '%s\n' 'La revisión debe ser la rama de Facebook o un identificador completo de GitHub.'
  exit 1
fi
SCALA_UPDATE_TEMP="$(mktemp -d)"
trap 'rm -rf -- "$SCALA_UPDATE_TEMP"' EXIT

curl -fsSL --retry 2 --connect-timeout 15 --max-time 120 "https://codeload.github.com/jpreston65p-ux/AiScalaRe/tar.gz/$SCALA_UPDATE_REVISION" -o "$SCALA_UPDATE_TEMP/codigo.tar.gz"
tar -xzf "$SCALA_UPDATE_TEMP/codigo.tar.gz" -C "$SCALA_UPDATE_TEMP" --strip-components=2 --wildcards '*/scala-facebook-comments/src/*'
[[ -f "$SCALA_UPDATE_TEMP/src/connection-flow.mjs" && -f "$SCALA_UPDATE_TEMP/src/connect-comments.mjs" ]]
for SCALA_UPDATE_FILE in "$SCALA_UPDATE_TEMP"/src/*.mjs; do
  node --check "$SCALA_UPDATE_FILE"
done
# The entire set of managed source modules is ready before replacing files.
# Dependencies, customer configuration, database and browser profile stay intact.
cp -a -- "$SCALA_UPDATE_TEMP/src/." "$SCALA_FACEBOOK_ROOT/src/"
printf '%s\n' 'Código SCALA actualizado. Se conservaron tu sesión, configuración y catálogo.'
printf '%s\n' 'Conecta con: bash CONECTAR_SCALA_FACEBOOK.sh --nube'
