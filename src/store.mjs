import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac, randomBytes } from 'node:crypto';

export class Store {
  constructor(directory, now = Date.now) {
    this.now = now;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
    this.db = new DatabaseSync(join(directory, 'scala.sqlite'));
    chmodSync(join(directory, 'scala.sqlite'), 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS auth (category TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(category,id));
      CREATE TABLE IF NOT EXISTS contacts (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS aliases (alias TEXT PRIMARY KEY, contact TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS orders (contact TEXT NOT NULL, product TEXT NOT NULL, value TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(contact,product));
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, state TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS events_expiry ON events(expires);
      CREATE TABLE IF NOT EXISTS outbound (id TEXT PRIMARY KEY, text TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS quotas (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS runner (id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT NOT NULL, expires INTEGER NOT NULL);`);
    this.transaction(() => {
      this.hashKey = this.meta('hash_key');
      if (!this.hashKey) { this.hashKey = randomBytes(32).toString('hex'); this.setMeta('hash_key', this.hashKey); }
    });
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); this.db.exec('COMMIT'); return r; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  meta(key) { return this.db.prepare('SELECT value FROM metadata WHERE key=?').get(key)?.value; }
  setMeta(key, value) { this.db.prepare('INSERT INTO metadata VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value)); }
  hash(value) { return createHmac('sha256', this.hashKey).update(value).digest('hex'); }
  authGet(category, id) { return this.db.prepare('SELECT value FROM auth WHERE category=? AND id=?').get(category, id)?.value; }
  authSet(category, id, value) {
    if (value == null) this.db.prepare('DELETE FROM auth WHERE category=? AND id=?').run(category, id);
    else this.db.prepare('INSERT INTO auth VALUES (?,?,?) ON CONFLICT(category,id) DO UPDATE SET value=excluded.value').run(category, id, value);
  }
  clearAuth() { this.transaction(() => { this.db.exec('DELETE FROM auth'); this.setMeta('auth_invalid', '0'); }); }
  contact(id) {
    const row = this.db.prepare('SELECT value FROM contacts WHERE id=?').get(id);
    return row ? JSON.parse(row.value) : { product_id: null, handoff_until: 0, stopped: false, options: {}, last_inbound_at: 0, restarted_at: 0, updated_at: 0 };
  }
  saveContact(id, value) { this.db.prepare('INSERT INTO contacts VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(id, JSON.stringify(value)); }
  trustedOrders(id) {
    return Object.fromEntries(this.db.prepare('SELECT product,value FROM orders WHERE contact=?').all(id).map(row => [row.product, JSON.parse(row.value)]));
  }
  setTrustedOrder(id, product, approval) {
    if (!this.db.prepare('SELECT id FROM contacts WHERE id=?').get(id) || !/^[a-z0-9_-]{1,40}$/.test(product) || approval?.paymentConfirmed !== true || typeof approval.deliveryAuthorized !== 'boolean') throw new Error('invalid_approval');
    let downloadUrl = null;
    if (approval.downloadUrl != null && approval.downloadUrl !== '') {
      try { const url = new URL(approval.downloadUrl); if (url.protocol !== 'https:' || url.username || url.password || /\[[^\]]+\]/.test(approval.downloadUrl) || approval.downloadUrl.length > 2048) throw new Error(); downloadUrl = url.href; }
      catch { throw new Error('invalid_download_url'); }
    }
    const updated = this.now();
    const value = { source: 'owner_console', paymentConfirmed: true, deliveryAuthorized: approval.deliveryAuthorized, downloadUrl, verifiedAt: updated };
    this.db.prepare('INSERT INTO orders VALUES (?,?,?,?) ON CONFLICT(contact,product) DO UPDATE SET value=excluded.value,updated=excluded.updated').run(id, product, JSON.stringify(value), updated);
  }
  knownPeers(addresses) {
    return [...new Set(addresses.map(jid => this.db.prepare('SELECT contact FROM aliases WHERE alias=?').get(this.hash('peer:' + jid))?.contact).filter(Boolean))];
  }
  resolvePeer(addresses) {
    const aliases = [...new Set(addresses)].map(jid => this.hash('peer:' + jid));
    return this.transaction(() => {
      const known = [...new Set(aliases.map(a => this.db.prepare('SELECT contact FROM aliases WHERE alias=?').get(a)?.contact).filter(Boolean))];
      const id = known[0] || aliases[0];
      if (!id) throw new Error('invalid_peer');
      if (known.length > 1) {
        const rows = known.map(k => this.contact(k)).sort((a,b) => b.updated_at-a.updated_at);
        const merged = { ...rows[0] };
        merged.restarted_at = Math.max(...rows.map(r => r.restarted_at || 0));
        const pauses = rows.map(r => r.handoff_until || 0).filter(t => t - 86400000 >= merged.restarted_at);
        merged.handoff_until = pauses.length ? Math.max(...pauses) : 0;
        merged.last_inbound_at = Math.max(...rows.map(r => r.last_inbound_at || 0));
        this.saveContact(id, merged);
        for (const old of known.slice(1)) {
          for (const order of this.db.prepare('SELECT product,value,updated FROM orders WHERE contact=?').all(old)) {
            this.db.prepare('INSERT INTO orders VALUES (?,?,?,?) ON CONFLICT(contact,product) DO UPDATE SET value=excluded.value,updated=excluded.updated WHERE excluded.updated > orders.updated').run(id, order.product, order.value, order.updated);
          }
          this.db.prepare('DELETE FROM orders WHERE contact=?').run(old);
          this.db.prepare('UPDATE aliases SET contact=? WHERE contact=?').run(id, old);
          this.db.prepare('DELETE FROM contacts WHERE id=?').run(old);
        }
      }
      for (const a of aliases) this.db.prepare('INSERT INTO aliases VALUES (?,?) ON CONFLICT(alias) DO UPDATE SET contact=excluded.contact').run(a, id);
      return id;
    });
  }
  eventId(direction, id) { return this.hash(direction + ':' + id); }
  hasEvent(direction, id) { return !!this.db.prepare('SELECT id FROM events WHERE id=?').get(this.eventId(direction, id)); }
  claim(direction, id, state = 'processing') {
    return this.db.prepare('INSERT OR IGNORE INTO events VALUES (?,?,?)').run(this.eventId(direction, id), state, this.now() + 8*86400000).changes === 1;
  }
  mark(direction, id, state) { this.db.prepare('UPDATE events SET state=? WHERE id=?').run(state, this.eventId(direction, id)); }
  eventState(direction, id) { return this.db.prepare('SELECT state FROM events WHERE id=?').get(this.eventId(direction,id))?.state; }
  saveOutgoing(id,text) { this.db.prepare('INSERT OR REPLACE INTO outbound VALUES (?,?,?)').run(this.eventId('out',id),text,this.now()+86400000); }
  outgoingText(id) { return this.db.prepare('SELECT text FROM outbound WHERE id=? AND expires>?').get(this.eventId('out',id),this.now())?.text; }
  allow(id, dailyLimit) {
    const t = this.now(), minute = Math.floor(t/60000), day = Math.floor(t/86400000);
    const buckets = [[`${id}:m:${minute}`,10,t+120000], [`${id}:d:${day}`,100,t+2*86400000], [`global:${day}`,dailyLimit,t+2*86400000]];
    return this.transaction(() => {
      if (buckets.some(([key,limit]) => (this.db.prepare('SELECT count FROM quotas WHERE id=?').get(key)?.count || 0) >= limit)) return false;
      for (const [key,,expires] of buckets) this.db.prepare('INSERT INTO quotas VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1').run(key, expires);
      return true;
    });
  }
  acquireRunner(owner) {
    this.transaction(() => {
      const old = this.db.prepare('SELECT owner,expires FROM runner WHERE id=1').get();
      if (old && old.expires > this.now() && old.owner !== owner) throw new Error('already_running');
      this.db.prepare('INSERT INTO runner VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires=excluded.expires').run(owner, this.now()+30000);
    });
  }
  renewRunner(owner) {
    if (this.db.prepare('UPDATE runner SET expires=? WHERE id=1 AND owner=?').run(this.now()+30000,owner).changes !== 1) throw new Error('runner_lost');
  }
  releaseRunner(owner) { this.db.prepare('DELETE FROM runner WHERE owner=?').run(owner); }
  cleanup() {
    this.db.prepare('DELETE FROM events WHERE expires<?').run(this.now());
    this.db.prepare('DELETE FROM outbound WHERE expires<?').run(this.now());
    this.db.prepare('DELETE FROM quotas WHERE expires<?').run(this.now());
    const oldest = this.now()-30*86400000;
    const expired = this.db.prepare('SELECT id FROM contacts WHERE CAST(json_extract(value,\'$.updated_at\') AS INTEGER)<? AND json_extract(value,\'$.stopped\')=0 AND NOT EXISTS (SELECT 1 FROM orders WHERE orders.contact=contacts.id)').all(oldest);
    this.transaction(() => { for(const {id} of expired) { this.db.prepare('DELETE FROM contacts WHERE id=?').run(id); this.db.prepare('DELETE FROM aliases WHERE contact=?').run(id); } });
  }
  close() { this.db.close(); }
}
