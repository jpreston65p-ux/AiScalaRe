import { accessSync, constants, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hasLinkedCredentials } from './session.mjs';

export function requireCloudVolume(dataDir, env = process.env) {
  const mount = env.RAILWAY_VOLUME_MOUNT_PATH;
  if (!mount || resolve(mount) !== resolve(dataDir)) throw new Error('missing_cloud_volume');
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  chmodSync(dataDir, 0o700);
  accessSync(dataDir, constants.R_OK | constants.W_OK | constants.X_OK);
}

export function readCloudStatus(dataDir, now = Date.now()) {
  const result = { paired: false, needsQr: true, runnerActive: false, paused: existsSync(join(dataDir, 'cloud.pause')), lastConnectedAt: null, lastReplyAt: null };
  const file = join(dataDir, 'scala.sqlite');
  if (!existsSync(file)) return result;
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout=1000; BEGIN');
    const row = db.prepare("SELECT value FROM auth WHERE category='credentials' AND id='main'").get();
    const meta = key => db.prepare('SELECT value FROM metadata WHERE key=?').get(key)?.value;
    result.paired = !!row && hasLinkedCredentials(JSON.parse(row.value));
    result.needsQr = !result.paired || meta('auth_invalid') === '1';
    result.lastConnectedAt = meta('last_connected_at') || null;
    result.lastReplyAt = meta('last_reply_at') || null;
    result.runnerActive = (db.prepare('SELECT expires FROM runner WHERE id=1').get()?.expires || 0) > now;
    db.exec('COMMIT');
    return result;
  } finally { db.close(); }
}

// The pairing process holds the same SQLite lease as the bot. Wait until it
// has finished, including the first successful connection, before starting.
export function mayStartCloudBot(status) {
  return status.paired && !status.needsQr && !status.paused && !status.runnerActive && Number(status.lastConnectedAt) > 0;
}
