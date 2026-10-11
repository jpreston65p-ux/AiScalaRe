import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadConfig, projectRoot } from './config.mjs';
import { requireCloudVolume, readCloudStatus, mayStartCloudBot } from './cloud.mjs';

export class CloudSupervisor {
  constructor({ dataDir, readStatus = () => readCloudStatus(dataDir), spawnBot = () => spawn(process.execPath, ['--max-old-space-size=256', 'src/index.mjs', '--servicio'], { cwd: projectRoot, stdio: 'inherit' }), log = event => process.stdout.write(`[${new Date().toISOString()}] ${event}\n`), pollMs = 3000, retryMs = 15000, stopMs = 12000 }) {
    Object.assign(this, { readStatus, spawnBot, log, pollMs, retryMs, stopMs });
    this.child = null; this.closed = false; this.nextStart = 0; this.lastEvent = null;
  }
  announce(event) {
    if (event !== this.lastEvent) { this.lastEvent = event; this.log(event); }
  }
  start() { this.tick(); this.timer = setInterval(() => this.tick(), this.pollMs); }
  tick() {
    if (this.closed) return;
    let status;
    try { status = this.readStatus(); }
    catch { this.announce('nube_error_leyendo_sesion'); return; }
    if (status.paused) {
      this.announce('nube_pausada_para_vincular');
      if (this.child && !this.stopping) {
        this.stopping = true;
        this.killTimer = setTimeout(() => this.child?.kill('SIGKILL'), this.stopMs);
        this.child.kill('SIGTERM');
      }
      return;
    }
    if (this.child) return;
    if (!mayStartCloudBot(status)) {
      this.announce(status.runnerActive ? 'nube_esperando_fin_vinculacion' : 'nube_esperando_vinculacion_privada');
      return;
    }
    if (Date.now() < this.nextStart) return;
    this.announce('nube_iniciando_atencion');
    let child;
    try { child = this.spawnBot(); }
    catch { this.nextStart = Date.now() + this.retryMs; this.announce('nube_reintentando_inicio'); return; }
    this.child = child; this.stopping = false;
    child.once('error', () => this.announce('nube_error_proceso'));
    child.once('close', code => {
      clearTimeout(this.killTimer); this.child = null; this.stopping = false;
      this.nextStart = Date.now() + (code === 78 ? 0 : this.retryMs);
      if (!this.closed) this.announce(code === 78 ? 'nube_sesion_necesita_revision' : 'nube_reintentando_inicio');
    });
  }
  async stop() {
    this.closed = true; clearInterval(this.timer); clearTimeout(this.killTimer);
    if (!this.child) return;
    const child = this.child;
    await new Promise(resolveDone => {
      const timeout = setTimeout(() => child.kill('SIGKILL'), this.stopMs);
      child.once('close', () => { clearTimeout(timeout); resolveDone(); });
      child.kill('SIGTERM');
    });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  let supervisor;
  try {
    if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('wrong_node');
    const config = loadConfig();
    requireCloudVolume(config.dataDir);
    supervisor = new CloudSupervisor({ dataDir: config.dataDir });
    const stop = async () => { await supervisor.stop(); process.exit(0); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    supervisor.start();
  } catch (error) {
    const message = error?.message === 'missing_cloud_volume'
      ? 'Falta el volumen persistente de Railway en SCALA_DATA_DIR. No se guardará ninguna sesión en un disco temporal.'
      : 'No se pudo iniciar el servicio. Revisa Node 24, catalogo.json y los permisos del volumen (RAILWAY_RUN_UID=0).';
    process.stdout.write(message + '\n'); process.exitCode = 78;
  }
}
