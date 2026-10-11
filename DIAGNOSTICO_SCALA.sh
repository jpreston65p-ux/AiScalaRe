#!/usr/bin/env bash
set -euo pipefail
SCALA_PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd -- "$SCALA_PROJECT_ROOT"
source scripts/entorno.sh
exec "$SCALA_NODE_BIN" scripts/diagnostico.mjs "$@"
