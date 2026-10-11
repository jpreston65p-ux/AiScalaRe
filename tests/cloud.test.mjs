import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { once, EventEmitter } from 'node:events';
import { Store } from '../src/store.mjs';
import { requireCloudVolume, readCloudStatus, mayStartCloudBot } from '../src/cloud.mjs';
import { CloudSupervisor } from '../src/railway.mjs';

function temp(t) {
  const dir = mkdtempSync(join(tmpdir(), 'scala-cloud-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('Railway rechaza el disco temporal antes de crear credenciales', t => {
  const dir = temp(t), env = { ...process.env, SCALA_DATA_DIR: dir };
  delete env.RAILWAY_VOLUME_MOUNT_PATH;
  const result = spawnSync(process.execPath, ['src/railway.mjs'], { cwd: new URL('../', import.meta.url), env, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 78); assert.match(result.stdout, /Falta el volumen persistente/);
  assert.equal(existsSync(join(dir, 'scala.sqlite')), false);
  assert.throws(() => requireCloudVolume(dir, { RAILWAY_VOLUME_MOUNT_PATH: join(dir, 'another') }), /missing_cloud_volume/);
  assert.doesNotMatch(result.stdout + result.stderr, /Escanea este QR|PRIVATE KEY/);
});

test('el estado del servidor acepta QR, espera al vinculador y respeta pausas e invalidaciones', t => {
  const dir = temp(t); let clock = Date.now();
  requireCloudVolume(dir, { RAILWAY_VOLUME_MOUNT_PATH: dir });
  assert.equal(mayStartCloudBot(readCloudStatus(dir)), false);
  const store = new Store(dir, () => clock); t.after(() => store.close());
  store.authSet('credentials', 'main', JSON.stringify({ registered: false, me: { id: '100:1@s.whatsapp.net' }, privateFixture: 'SECRET_MUST_NOT_APPEAR' }));
  store.setMeta('last_connected_at', clock); store.acquireRunner('pairing-fixture');
  assert.equal(mayStartCloudBot(readCloudStatus(dir, clock)), false);
  store.releaseRunner('pairing-fixture');
  assert.equal(mayStartCloudBot(readCloudStatus(dir, clock)), true);
  assert.doesNotMatch(JSON.stringify(readCloudStatus(dir, clock)), /SECRET_MUST_NOT_APPEAR|100:1@s.whatsapp.net/);
  writeFileSync(join(dir, 'cloud.pause'), ''); assert.equal(mayStartCloudBot(readCloudStatus(dir, clock)), false);
  rmSync(join(dir, 'cloud.pause'));
  store.setMeta('auth_invalid', '1'); assert.equal(mayStartCloudBot(readCloudStatus(dir, clock)), false);
  store.setMeta('auth_invalid', '0'); store.acquireRunner('crashed-pairer'); clock += 31000;
  assert.equal(mayStartCloudBot(readCloudStatus(dir, clock)), true);
});

test('el supervisor espera la sesión y el fin de vinculación antes de arrancar un único bot', async () => {
  let state = { paired: false, needsQr: true, runnerActive: false, paused: false, lastConnectedAt: null };
  const children = [], logs = [];
  const supervisor = new CloudSupervisor({
    readStatus: () => state, log: event => logs.push(event), retryMs: 0,
    spawnBot: () => { const child = new EventEmitter(); child.kill = signal => { child.signal = signal; child.emit('close', 0); }; children.push(child); return child; },
  });
  supervisor.tick(); supervisor.tick(); assert.equal(children.length, 0); assert.equal(logs.length, 1);
  state = { ...state, paired: true, needsQr: false, lastConnectedAt: Date.now(), runnerActive: true };
  supervisor.tick(); assert.equal(children.length, 0);
  state.runnerActive = false; supervisor.tick(); supervisor.tick(); assert.equal(children.length, 1);
  state.paused = true; supervisor.tick(); assert.equal(children[0].signal, 'SIGTERM');
  supervisor.tick(); assert.equal(children.length, 1);
  state.paused = false; supervisor.tick(); assert.equal(children.length, 2);
  await supervisor.stop(); supervisor.tick(); assert.equal(children.length, 2);
});

test('el supervisor recupera un proceso caído y propaga el cierre a un proceso real', async t => {
  const children = [], logs = [];
  const supervisor = new CloudSupervisor({
    readStatus: () => ({ paired: true, needsQr: false, runnerActive: false, paused: false, lastConnectedAt: Date.now() }),
    log: event => logs.push(event), retryMs: 0, stopMs: 500,
    spawnBot: () => {
      const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
      children.push(child); return child;
    },
  });
  t.after(() => supervisor.stop());
  supervisor.tick(); await once(children[0], 'spawn');
  const firstClose = once(children[0], 'close'); children[0].kill('SIGKILL'); await firstClose;
  supervisor.tick(); await once(children[1], 'spawn');
  await supervisor.stop(); assert.equal(supervisor.child, null);
  assert.equal(children.length, 2); assert.ok(logs.includes('nube_reintentando_inicio'));
});

test('la vinculación en la nube exige una terminal privada y nunca imprime QR en logs', t => {
  const dir = temp(t);
  const result = spawnSync(process.execPath, ['scripts/vincular-nube.mjs'], {
    cwd: new URL('../', import.meta.url), env: { ...process.env, SCALA_DATA_DIR: dir, RAILWAY_VOLUME_MOUNT_PATH: dir }, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 1); assert.match(result.stdout, /terminal de Linux Mint/);
  assert.equal(existsSync(join(dir, 'cloud.pause')), false);
  assert.equal(existsSync(join(dir, 'scala.sqlite')), false);
  assert.doesNotMatch(result.stdout, /Escanea este QR/);
});
