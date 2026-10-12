#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/scripts/entorno.sh"
if [[ $# -gt 1 || $# -eq 1 && "$1" != '--nube' ]]; then
  printf '%s\n' 'Usa: bash PREPARAR_SCALA_FACEBOOK.sh [--nube]'
  exit 64
fi
npm ci --ignore-scripts --no-audit --no-fund
if [[ "${1:-}" == '--nube' ]]; then
  printf '%s\n' 'Se instalarán las bibliotecas oficiales que Firefox necesita. Linux Mint puede pedir tu contraseña en esta terminal.'
  npx --no-install playwright install-deps firefox
  npx --no-install playwright install firefox
else
  npx --no-install playwright install chromium
fi
printf '%s\n' 'Proyecto preparado. Conecta la sesión del programa con: bash CONECTAR_SCALA_FACEBOOK.sh' 'La sesión de Facebook de esta conversación no se transfiere al programa.'
