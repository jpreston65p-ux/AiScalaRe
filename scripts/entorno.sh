#!/usr/bin/env bash
SCALA_PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SCALA_NODE_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/scala-whatsapp/node24"
if [[ -x "$SCALA_NODE_DIR/bin/node" ]] && [[ "$("$SCALA_NODE_DIR/bin/node" -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)" == 24 ]]; then
  SCALA_NODE_BIN="$SCALA_NODE_DIR/bin/node"
  export PATH="$SCALA_NODE_DIR/bin:$PATH"
elif command -v node >/dev/null 2>&1 && [[ "$(node -p 'process.versions.node.split(".")[0]')" == 24 ]]; then
  SCALA_NODE_BIN="$(command -v node)"
else
  printf '%s\n' 'Falta Node.js. Ejecuta: bash PREPARAR_SCALA_MINT.sh'
  return 1
fi
if [[ "$("$SCALA_NODE_BIN" -p 'process.versions.node.split(".")[0]')" != 24 ]]; then
  printf '%s\n' 'Se necesita Node.js 24. Ejecuta: bash PREPARAR_SCALA_MINT.sh'
  return 1
fi
