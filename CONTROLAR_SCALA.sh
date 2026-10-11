#!/usr/bin/env bash
set -euo pipefail
case "${1:-estado}" in
  estado) exec systemctl status scala-whatsapp-qr.service --no-pager ;;
  logs) exec sudo journalctl -u scala-whatsapp-qr.service -n 50 -f ;;
  iniciar) exec sudo systemctl start scala-whatsapp-qr.service ;;
  detener) exec sudo systemctl stop scala-whatsapp-qr.service ;;
  reiniciar) exec sudo systemctl restart scala-whatsapp-qr.service ;;
  *) printf '%s\n' 'Uso: bash CONTROLAR_SCALA.sh estado|logs|iniciar|detener|reiniciar'; exit 2 ;;
esac
