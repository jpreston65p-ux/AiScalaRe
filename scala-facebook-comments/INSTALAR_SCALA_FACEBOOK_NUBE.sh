#!/usr/bin/env bash
set -euo pipefail
umask 077
if [[ ! -t 0 || -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then
  printf '%s\n' 'Abre la terminal desde el escritorio de Linux Mint para conectar Facebook.'
  exit 78
fi
SCALA_DOWNLOADS="$(xdg-user-dir DOWNLOAD 2>/dev/null || true)"
if [[ -z "$SCALA_DOWNLOADS" ]]; then SCALA_DOWNLOADS="$HOME/Descargas"; fi
SCALA_DESTINATION="$SCALA_DOWNLOADS/SCALA_FACEBOOK_NUBE"
SCALA_WORKDIR="$(mktemp -d)"
trap 'rm -rf -- "$SCALA_WORKDIR"' EXIT
mkdir -p -- "$SCALA_DESTINATION"
printf '%s\n' 'Preparando SCALA Facebook en tu carpeta de Descargas…'
curl --fail --silent --show-error --location 'https://codeload.github.com/jpreston65p-ux/AiScalaRe/tar.gz/refs/heads/scala-facebook-comentarios-cloud' -o "$SCALA_WORKDIR/source.tar.gz"
mkdir -p -- "$SCALA_WORKDIR/source"
tar -xzf "$SCALA_WORKDIR/source.tar.gz" -C "$SCALA_WORKDIR/source" --strip-components=2 --wildcards '*/scala-facebook-comments/*'
for SCALA_DIRECTORY in src scripts tests; do
  mkdir -p -- "$SCALA_DESTINATION/$SCALA_DIRECTORY"
  cp -R -- "$SCALA_WORKDIR/source/$SCALA_DIRECTORY/." "$SCALA_DESTINATION/$SCALA_DIRECTORY/"
done
for SCALA_FILE in package.json package-lock.json README_ES.md VALIDACION.txt PREPARAR_SCALA_FACEBOOK.sh CONECTAR_SCALA_FACEBOOK.sh INICIAR_SCALA_FACEBOOK.sh PROBAR_COMENTARIOS.sh PROBAR_MENSAJES.sh; do
  cp -- "$SCALA_WORKDIR/source/$SCALA_FILE" "$SCALA_DESTINATION/$SCALA_FILE"
done
for SCALA_FILE in facebook.config.json catalogo.json; do
  if [[ ! -e "$SCALA_DESTINATION/$SCALA_FILE" ]]; then cp -- "$SCALA_WORKDIR/source/$SCALA_FILE" "$SCALA_DESTINATION/$SCALA_FILE"; fi
done
cd -- "$SCALA_DESTINATION"
source scripts/entorno.sh
node - "$SCALA_WORKDIR/source/facebook.config.json" <<'NODE'
const fs=require('node:fs');
const defaults=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const current=JSON.parse(fs.readFileSync('facebook.config.json','utf8'));
if(current.comments?.ownerId===defaults.comments.ownerId && !current.comments.verificationUrl && current.comments.postUrls?.[0]===defaults.comments.postUrls[0]){
  current.comments.verificationUrl=defaults.comments.verificationUrl;
  fs.writeFileSync('facebook.config.json',JSON.stringify(current,null,2)+'\n',{mode:0o600});
}
NODE
bash PREPARAR_SCALA_FACEBOOK.sh --nube
bash CONECTAR_SCALA_FACEBOOK.sh --nube
