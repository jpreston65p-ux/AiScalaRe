#!/usr/bin/env bash
set -euo pipefail
SCALA_PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd -- "$SCALA_PROJECT_ROOT"
command -v systemctl >/dev/null || { printf '%s\n' 'Este comando requiere Linux con systemd. Puedes usar Docker como alternativa.'; exit 1; }
bash PREPARAR_SCALA_MINT.sh
source scripts/entorno.sh
"$SCALA_NODE_BIN" scripts/diagnostico.mjs --require-linked
SCALA_EXISTING_DIR="$(systemctl show scala-whatsapp-qr.service --property=WorkingDirectory --value 2>/dev/null || true)"
if [[ -n "$SCALA_EXISTING_DIR" && "$SCALA_EXISTING_DIR" != "$SCALA_PROJECT_ROOT" ]]; then
  printf '%s\n' "Ya existe un servicio SCALA en otra carpeta: $SCALA_EXISTING_DIR"
  exit 1
fi
SCALA_UNIT_TEMP="$(mktemp)"
trap 'rm -f -- "$SCALA_UNIT_TEMP"' EXIT
"$SCALA_NODE_BIN" scripts/unidad.mjs "$SCALA_PROJECT_ROOT" "$SCALA_NODE_BIN" "$(id -un)" > "$SCALA_UNIT_TEMP"
if [[ "$(id -u)" == 0 ]]; then SCALA_SUDO=(); else SCALA_SUDO=(sudo); fi
"${SCALA_SUDO[@]}" install -m 644 "$SCALA_UNIT_TEMP" /etc/systemd/system/scala-whatsapp-qr.service
"${SCALA_SUDO[@]}" systemctl daemon-reload
"${SCALA_SUDO[@]}" systemctl enable scala-whatsapp-qr.service
"${SCALA_SUDO[@]}" systemctl restart scala-whatsapp-qr.service
systemctl status scala-whatsapp-qr.service --no-pager --lines=6
printf '%s\n' 'Servicio instalado. Logs: bash CONTROLAR_SCALA.sh logs'
