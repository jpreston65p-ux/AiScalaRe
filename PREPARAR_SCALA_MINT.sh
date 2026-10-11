#!/usr/bin/env bash
set -euo pipefail
umask 077
SCALA_PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd -- "$SCALA_PROJECT_ROOT"
mkdir -p .runtime data
chmod 700 .runtime data
SCALA_NODE_READY=false
SCALA_NODE_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/scala-whatsapp/node24"
if [[ -x "$SCALA_NODE_DIR/bin/node" ]] && [[ "$("$SCALA_NODE_DIR/bin/node" -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)" == 24 ]]; then
  SCALA_NODE_READY=true
elif [[ "${SCALA_FORCE_PRIVATE_NODE:-0}" != 1 ]] && command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 && [[ "$(node -p 'process.versions.node.split(".")[0]')" == 24 ]]; then
  SCALA_NODE_READY=true
fi
if [[ "$SCALA_NODE_READY" == false ]]; then
  case "$(uname -m)" in
    x86_64) SCALA_NODE_ARCH=x64 ;;
    aarch64|arm64) SCALA_NODE_ARCH=arm64 ;;
    *) printf '%s\n' 'Este paquete requiere Linux de 64 bits (x64 o arm64).'; exit 1 ;;
  esac
  command -v tar >/dev/null || { printf '%s\n' 'Falta tar. Instálalo con sudo apt install tar xz-utils.'; exit 1; }
  command -v xz >/dev/null || { printf '%s\n' 'Falta xz. Instálalo con sudo apt install xz-utils.'; exit 1; }
  SCALA_DOWNLOAD_DIR="$(mktemp -d)"
  trap 'rm -rf -- "$SCALA_DOWNLOAD_DIR"' EXIT
  scala_download() {
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL --retry 2 --connect-timeout 15 --max-time 180 --output "$2" "$1"
    elif command -v wget >/dev/null 2>&1; then
      wget --https-only --timeout=30 --tries=3 --output-document="$2" "$1"
    else
      printf '%s\n' 'Falta curl o wget. Instala uno: sudo apt install curl'
      return 1
    fi
  }
  printf '%s\n' 'Preparando Node.js 24 privado para SCALA (conserva tu Node.js del sistema).'
  scala_download 'https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt' "$SCALA_DOWNLOAD_DIR/SHASUMS256.txt"
  read -r SCALA_NODE_SHA SCALA_NODE_FILE < <(awk -v arch="$SCALA_NODE_ARCH" '$2 ~ ("^node-v[0-9.]+-linux-" arch "\\.tar\\.xz$") {print; exit}' "$SCALA_DOWNLOAD_DIR/SHASUMS256.txt")
  [[ "$SCALA_NODE_SHA" =~ ^[a-f0-9]{64}$ && "$SCALA_NODE_FILE" =~ ^node-v24\.[0-9]+\.[0-9]+-linux-(x64|arm64)\.tar\.xz$ ]] || { printf '%s\n' 'No se pudo validar el archivo oficial de Node.js.'; exit 1; }
  scala_download "https://nodejs.org/dist/latest-v24.x/$SCALA_NODE_FILE" "$SCALA_DOWNLOAD_DIR/$SCALA_NODE_FILE"
  printf '%s  %s\n' "$SCALA_NODE_SHA" "$SCALA_DOWNLOAD_DIR/$SCALA_NODE_FILE" | sha256sum --check --status
  mkdir -p "$SCALA_NODE_DIR"
  chmod 700 "$SCALA_NODE_DIR"
  tar -xJf "$SCALA_DOWNLOAD_DIR/$SCALA_NODE_FILE" -C "$SCALA_NODE_DIR" --strip-components=1 --no-same-owner
fi
source scripts/entorno.sh
SCALA_LOCK_HASH="$(sha256sum package-lock.json | cut -d ' ' -f1)"
SCALA_PREVIOUS_HASH="$(cat .runtime/deps.sha256 2>/dev/null || true)"
if [[ "$SCALA_LOCK_HASH" != "$SCALA_PREVIOUS_HASH" || ! -d node_modules/@whiskeysockets/baileys ]]; then
  printf '%s\n' 'Instalando las dependencias de SCALA...'
  npm ci --omit=dev --no-audit --no-fund
  printf '%s\n' "$SCALA_LOCK_HASH" > .runtime/deps.sha256
fi
"$SCALA_NODE_BIN" -e 'import("@whiskeysockets/baileys").then(m=>{if(typeof m.default!=="function")process.exit(1)})'
printf '%s\n' 'Preparación completa. Inicia con: bash INICIAR_SCALA_WHATSAPP.sh'
