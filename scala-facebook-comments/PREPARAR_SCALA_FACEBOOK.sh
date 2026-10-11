#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/scripts/entorno.sh"
npm ci --ignore-scripts --no-audit --no-fund
npx --no-install playwright install chromium
printf '%s\n' 'Proyecto preparado. Conecta la sesión del programa con: bash CONECTAR_SCALA_FACEBOOK.sh' 'La sesión de Facebook de esta conversación no se transfiere al programa.'
