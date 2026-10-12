import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync,writeFileSync,readFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {peerKey} from './policy.mjs';

export class Store{
  constructor(dir){
    this.dir=dir;mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);
    this.db=new DatabaseSync(join(dir,'meta.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,post TEXT NOT NULL,at INTEGER NOT NULL,author TEXT NOT NULL,
        textHash TEXT NOT NULL,status TEXT NOT NULL,nextAt INTEGER NOT NULL,replyId TEXT,attemptAt INTEGER);
      CREATE TABLE IF NOT EXISTS paused(peer TEXT PRIMARY KEY);
      CREATE INDEX IF NOT EXISTS pending ON jobs(status,nextAt);`);
    this.salt=this.get('salt') || randomBytes(32).toString('hex');this.set('salt',this.salt);
  }
  get(key){return this.db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value;}
  set(key,value){this.db.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run(key,String(value));}
  config(){try{const c=JSON.parse(readFileSync(join(this.dir,'credentials.json'),'utf8'));return typeof c.appSecret==='string' && typeof c.pageToken==='string'?c:null;}catch{return null;}}
  saveConfig(c){
    const tmp=join(this.dir,'credentials.new');writeFileSync(tmp,JSON.stringify(c),{mode:0o600});
    renameSync(tmp,join(this.dir,'credentials.json'));chmodSync(join(this.dir,'credentials.json'),0o600);
  }
  enqueue(events){
    this.db.exec('BEGIN IMMEDIATE');try{
      const insert=this.db.prepare('INSERT OR IGNORE INTO jobs(id,post,at,author,textHash,status,nextAt) VALUES(?,?,?,?,?,\'queued\',?)');
      const total=this.db.prepare("SELECT count(*) AS n FROM jobs WHERE status IN ('queued','sending','uncertain')").get().n;
      if(total+events.length>1000)throw new Error('queue_full');
      for(const e of events)insert.run(e.id,e.post,e.at,e.author,e.textHash,Date.now());
      this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  next(now=Date.now()){return this.db.prepare("SELECT * FROM jobs WHERE status IN ('queued','sending','uncertain') AND nextAt<=? ORDER BY at LIMIT 1").get(now);}
  mark(id,status,{replyId=null,delay=0}={}){
    this.db.prepare('UPDATE jobs SET status=?,replyId=COALESCE(?,replyId),nextAt=?,attemptAt=CASE WHEN ?=\'sending\' THEN ? ELSE attemptAt END WHERE id=?')
      .run(status,replyId,Date.now()+delay,status,Date.now(),id);
  }
  allowed(author,now=Date.now()){
    const key=peerKey(author,this.salt);
    if(this.db.prepare('SELECT 1 FROM paused WHERE peer=?').get(key))return false;
    const start=Math.floor(now/86400000)*86400000;
    const all=this.db.prepare("SELECT count(*) AS n FROM jobs WHERE status IN ('sent','sending','uncertain') AND attemptAt>=?").get(start).n;
    const peer=this.db.prepare("SELECT count(*) AS n,max(attemptAt) AS last FROM jobs WHERE author=? AND status IN ('sent','sending','uncertain') AND attemptAt>=?").get(author,start);
    return all<100 && peer.n<3 && (!peer.last || now-peer.last>=300000);
  }
  pause(author){this.db.prepare('INSERT OR IGNORE INTO paused VALUES(?)').run(peerKey(author,this.salt));}
  cleanup(now=Date.now()){this.db.prepare('DELETE FROM jobs WHERE at<?').run(now-30*86400000);}
  close(){this.db.close();}
}
