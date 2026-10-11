#!/usr/bin/env bash
SCALA_FACEBOOK_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SCALA_FACEBOOK_NODE_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/scala-whatsapp/node24"
if [[ -x "$SCALA_FACEBOOK_NODE_DIR/bin/node" ]]; then
  export PATH="$SCALA_FACEBOOK_NODE_DIR/bin:$PATH"
fi
if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)" != 24 ]]; then
  printf '%s\n' 'Se necesita Node.js 24. Puedes usar el que instalaste para SCALA WhatsApp.'
  return 1
fi
cd -- "$SCALA_FACEBOOK_ROOT" || return 1
