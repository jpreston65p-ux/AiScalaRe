#!/usr/bin/env bash
set -euo pipefail
umask 077
SCALA_ONLY_PATCH=0
SCALA_TARGET=""
for SCALA_ARGUMENT in "$@"; do
  case "$SCALA_ARGUMENT" in
    --solo-corregir) SCALA_ONLY_PATCH=1 ;;
    --help) printf '%s\n' 'Uso: bash REPARAR_SCALA_SERVICIO.sh [--solo-corregir] [carpeta-del-proyecto]'; exit 0 ;;
    --*) printf '%s\n' 'Opción desconocida. Usa --help.'; exit 2 ;;
    *) [[ -z "$SCALA_TARGET" ]] || { printf '%s\n' 'Indica una sola carpeta del proyecto.'; exit 2; }; SCALA_TARGET="$SCALA_ARGUMENT" ;;
  esac
done
SCALA_SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "$SCALA_TARGET" ]]; then
  if [[ -f "$SCALA_SCRIPT_DIR/INICIAR_SCALA_WHATSAPP.sh" ]]; then
    SCALA_TARGET="$SCALA_SCRIPT_DIR"
  else
    SCALA_DOWNLOAD_DIR="$(xdg-user-dir DOWNLOAD 2>/dev/null || true)"
    [[ -n "$SCALA_DOWNLOAD_DIR" ]] || SCALA_DOWNLOAD_DIR="$HOME/Descargas"
    SCALA_TARGET="$SCALA_DOWNLOAD_DIR/SCALA_WHATSAPP_QR"
  fi
fi
[[ -f "$SCALA_TARGET/INSTALAR_SERVICIO.sh" ]] || { printf '%s\n' 'No se encuentra SCALA_WHATSAPP_QR. Pasa la carpeta del proyecto como argumento.'; exit 1; }
command -v python3 >/dev/null || { printf '%s\n' 'Necesitas Python 3. En Mint: sudo apt install python3'; exit 1; }
python3 - "$SCALA_TARGET" <<'PY'
import os
from pathlib import Path
import sys
import tempfile

root = Path(sys.argv[1]).resolve()
session_source = "// QR pairing stores the authenticated device in creds.me. The SDK's\n// registered flag can remain false after a successful QR login.\nexport function hasLinkedCredentials(creds) {\n  return typeof creds?.me?.id === 'string' && creds.me.id.trim().length > 0;\n}\n"
patches = {
    "src/index.mjs": [
        ("import { reconnectPolicy } from './lifecycle.mjs';", "import { reconnectPolicy } from './lifecycle.mjs';\nimport { hasLinkedCredentials } from './session.mjs';"),
        ("!auth.state.creds.registered", "!hasLinkedCredentials(auth.state.creds)"),
    ],
    "scripts/diagnostico.mjs": [
        ("import { loadConfig } from '../src/config.mjs';", "import { loadConfig } from '../src/config.mjs';\nimport { hasLinkedCredentials } from '../src/session.mjs';"),
        ("saved=!!row && JSON.parse(row.value).registered===true;", "saved=!!row && hasLinkedCredentials(JSON.parse(row.value));"),
    ],
}
updates = {}
for relative, pairs in patches.items():
    path = root / relative
    if not path.is_file() or path.is_symlink():
        sys.exit("No se reconoce el proyecto. No se ha cambiado ningún archivo.")
    value = path.read_text(encoding="utf-8")
    for previous, corrected in pairs:
        if corrected in value:
            if value.count(corrected) != 1:
                sys.exit("El proyecto tiene cambios distintos. No se ha cambiado ningún archivo.")
        elif value.count(previous) == 1:
            value = value.replace(previous, corrected, 1)
        else:
            sys.exit("El proyecto tiene cambios distintos. No se ha cambiado ningún archivo.")
    updates[path] = value

session_path = root / "src/session.mjs"
if session_path.exists() and (session_path.is_symlink() or session_path.read_text(encoding="utf-8") != session_source):
    sys.exit("La comprobación de sesión tiene cambios distintos. No se ha cambiado ningún archivo.")

backup_dir = root / ".runtime/reparacion-qr"
backup_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
os.chmod(backup_dir, 0o700)
# Install the shared helper before the two files that import it.
updates = {session_path: session_source, **updates}
for path, value in updates.items():
    current = path.read_text(encoding="utf-8") if path.exists() else None
    if current == value:
        continue
    if current is not None:
        backup = backup_dir / "__".join(path.relative_to(root).parts)
        if not backup.exists():
            backup.write_text(current, encoding="utf-8")
            os.chmod(backup, 0o600)
    descriptor, temporary = tempfile.mkstemp(prefix=".scala-qr-", dir=path.parent)
    with os.fdopen(descriptor, "w", encoding="utf-8") as output:
        output.write(value)
        output.flush()
        os.fsync(output.fileno())
    os.chmod(temporary, 0o644)
    os.replace(temporary, path)

print("Comprobación de sesión QR corregida. Se conservan la sesión y el catálogo.")
PY
if [[ "$SCALA_ONLY_PATCH" == 0 ]]; then
  cd -- "$SCALA_TARGET"
  bash INSTALAR_SERVICIO.sh
fi
