#!/usr/bin/env bash
set -euo pipefail
umask 077
SCALA_PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd -- "$SCALA_PROJECT_ROOT"
SCALA_SSH_TARGET="${1:-}"
if [[ -z "$SCALA_SSH_TARGET" ]]; then read -r -p 'Servidor Linux (usuario@IP o usuario@dominio): ' SCALA_SSH_TARGET; fi
[[ "$SCALA_SSH_TARGET" =~ ^[a-zA-Z_][a-zA-Z0-9_-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || { printf '%s\n' 'Usa una dirección SSH válida, por ejemplo ubuntu@203.0.113.10. Debe ser tu servidor real.'; exit 2; }
for SCALA_TOOL in ssh scp tar; do command -v "$SCALA_TOOL" >/dev/null || { printf '%s\n' 'Faltan herramientas. En Mint instala: sudo apt install openssh-client tar'; exit 1; }; done
SCALA_UPLOAD_DIR="$(mktemp -d)"
trap 'rm -rf -- "$SCALA_UPLOAD_DIR"' EXIT
# Explicit source allowlist: no WhatsApp sessions, node_modules or local keys.
tar -czf "$SCALA_UPLOAD_DIR/scala-source.tar.gz" package.json package-lock.json catalogo.json src scripts tests README_ES.md Dockerfile compose.yaml PREPARAR_SCALA_MINT.sh INICIAR_SCALA_WHATSAPP.sh DIAGNOSTICO_SCALA.sh INSTALAR_SERVICIO.sh CONTROLAR_SCALA.sh SUBIR_A_NUBE.sh
ssh "$SCALA_SSH_TARGET" 'mkdir -p scala-whatsapp-qr'
scp -- "$SCALA_UPLOAD_DIR/scala-source.tar.gz" "$SCALA_SSH_TARGET:scala-whatsapp-qr/scala-source.tar.gz"
ssh -t "$SCALA_SSH_TARGET" 'if systemctl is-active --quiet scala-whatsapp-qr.service; then sudo systemctl stop scala-whatsapp-qr.service; fi'
ssh "$SCALA_SSH_TARGET" 'cd scala-whatsapp-qr && tar -xzf scala-source.tar.gz && rm scala-source.tar.gz && bash PREPARAR_SCALA_MINT.sh'
printf '%s\n' 'Vinculando en el servidor de la nube. Escanea el QR que aparecerá en esta terminal.'
ssh -t "$SCALA_SSH_TARGET" 'cd scala-whatsapp-qr && bash INICIAR_SCALA_WHATSAPP.sh --solo-vincular'
ssh -t "$SCALA_SSH_TARGET" 'cd scala-whatsapp-qr && bash INSTALAR_SERVICIO.sh'
printf '%s\n' 'SCALA instalado en tu servidor. Comprueba que un mensaje nuevo recibe respuesta antes de apagar tu PC.'
