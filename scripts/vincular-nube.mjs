import { openSync, closeSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { loadConfig, projectRoot } from '../src/config.mjs';
import { requireCloudVolume, readCloudStatus } from '../src/cloud.mjs';

process.umask(0o077);
let pauseFile, ownPause = false, child, interrupted = false;
const stop = signal => { interrupted = true; child?.kill(signal); };
process.once('SIGINT', () => stop('SIGINT')); process.once('SIGTERM', () => stop('SIGTERM'));
try {
  if (process.argv.slice(2).some(arg => arg !== '--revincular')) throw new Error('invalid_args');
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('private_terminal_required');
  const config = loadConfig(); requireCloudVolume(config.dataDir);
  pauseFile = join(config.dataDir, 'cloud.pause');
  closeSync(openSync(pauseFile, 'wx', 0o600)); ownPause = true;
  process.stdout.write('Pausando la atención del servidor para vincular de forma privada…\n');
  const deadline = Date.now() + 45000;
  while (!interrupted && readCloudStatus(config.dataDir).runnerActive) {
    if (Date.now() >= deadline) throw new Error('runner_timeout');
    await delay(1000);
  }
  if (interrupted) throw new Error('interrupted');
  const status = readCloudStatus(config.dataDir);
  const reset = process.argv.includes('--revincular') || (status.paired && status.needsQr);
  child = spawn(process.execPath, ['--max-old-space-size=256', 'src/index.mjs', '--solo-vincular', ...(reset ? ['--revincular'] : [])], { cwd: projectRoot, stdio: 'inherit' });
  const code = await new Promise((resolveDone, reject) => { child.once('error', reject); child.once('close', code => resolveDone(code ?? 1)); });
  process.exitCode = code;
  if (code === 0) process.stdout.write('Sesión guardada. El servidor iniciará la atención automáticamente. Comprueba una respuesta desde otro número.\n');
} catch (error) {
  const messages = {
    private_terminal_required: 'Abre railway ssh en tu terminal de Linux Mint. El QR requiere una terminal privada interactiva.',
    missing_cloud_volume: 'Falta el volumen persistente. Móntalo en /app/data antes de vincular.',
    invalid_args: 'Uso: node scripts/vincular-nube.mjs [--revincular]',
    runner_timeout: 'El bot sigue ocupando la sesión. Revisa el estado del servicio antes de volver a intentar.',
    interrupted: 'Vinculación interrumpida.',
    EEXIST: 'Hay una vinculación en curso o quedó una pausa. Comprueba que no siga abierta y elimina /app/data/cloud.pause desde railway ssh para reanudar.',
  };
  process.stdout.write((messages[error?.code] || messages[error?.message] || 'No se pudo vincular. Revisa el volumen y los permisos del servicio.') + '\n');
  process.exitCode = 1;
} finally {
  if (ownPause) { try { unlinkSync(pauseFile); } catch {} }
}
