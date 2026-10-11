#!/usr/bin/env bash
set -euo pipefail
SCALA_PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd -- "$SCALA_PROJECT_ROOT"
bash PREPARAR_SCALA_MINT.sh
source scripts/entorno.sh
exec "$SCALA_NODE_BIN" --max-old-space-size=256 src/index.mjs "$@"
