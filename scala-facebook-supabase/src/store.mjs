import {PAGE_ID,VAULT_PREFIX} from './worker.mjs';
const DAY=86400000;
// Static SQL, bound values, private schema. No customer text or names.
export class PgStore{
  constructor(sql,now=Date.now){this.sql=sql;this.now=now;this.page=PAGE_ID;}
  q(query,...values){return this.sql.unsafe(query,values);}
  async init(){}
  async credentials(){
    const rows=await this.q('SELECT name,decrypted_secret FROM vault.decrypted_secrets WHERE name IN ($1,$2,$3,$4,$5)',
      VAULT_PREFIX+'app_secret',VAULT_PREFIX+'page_token',VAULT_PREFIX+'verify_token',VAULT_PREFIX+'wake_token',VAULT_PREFIX+'peer_key');
    const values=Object.fromEntries(rows.map(row=>[row.name.slice(VAULT_PREFIX.length),row.decrypted_secret]));
    return {...values,enabled:await this.get('enabled')==='1'};
  }
  async get(key){return (await this.q('SELECT value FROM scala_fb_private.metadata WHERE page=$1 AND key=$2',this.page,key))[0]?.value??null;}
  async set(key,value){await this.q('INSERT INTO scala_fb_private.metadata VALUES($1,$2,$3) ON CONFLICT(page,key) DO UPDATE SET value=EXCLUDED.value',this.page,key,String(value));}
  async enqueue(events){
    if(events.length>1000)throw new Error('queue_full');
    const page=this.page,now=this.now();
    await this.sql.begin(async tx=>{
      await tx.unsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,1))',[page]);
      const [{n}]=await tx.unsafe("SELECT count(*)::int n FROM scala_fb_private.jobs WHERE page=$1 AND status IN ('queued','sending','uncertain')",[page]);
      // Postgres.js serializes JSONB itself. A pre-stringified array becomes
      // a JSON string, causing PostgreSQL 22023 instead of an event array.
      const [{n:newCount}]=await tx.unsafe("SELECT count(*)::int n FROM (SELECT DISTINCT value->>'id' id FROM jsonb_array_elements($2::jsonb)) e WHERE NOT EXISTS(SELECT 1 FROM scala_fb_private.jobs j WHERE j.page=$1 AND j.id=e.id)",[page,tx.json(events)]);
      if(n+newCount>1000)throw new Error('queue_full');
      for(const e of events)await tx.unsafe("INSERT INTO scala_fb_private.jobs(page,id,post,at,author,text_hash,status,next_at) VALUES($1,$2,$3,$4,$5,$6,'queued',$7) ON CONFLICT(page,id) DO NOTHING",[page,e.id,e.post,e.at,e.author,e.textHash,now]);
    });
  }
  async lock(){
    const holder=crypto.randomUUID(),now=this.now();
    const rows=await this.q('INSERT INTO scala_fb_private.locks VALUES($1,$2,$3) ON CONFLICT(page) DO UPDATE SET holder=EXCLUDED.holder,until_at=EXCLUDED.until_at WHERE scala_fb_private.locks.until_at<=$4 RETURNING holder',this.page,holder,now+45000,now);
    return rows.length===1?holder:null;
  }
  async renew(holder){
    const rows=await this.q('UPDATE scala_fb_private.locks SET until_at=$1 WHERE page=$2 AND holder=$3 AND until_at>$4 RETURNING holder',this.now()+45000,this.page,holder,this.now());
    if(rows.length!==1)throw new Error('lease_lost');
  }
  async unlock(holder){await this.q('DELETE FROM scala_fb_private.locks WHERE page=$1 AND holder=$2',this.page,holder);}
  async next(){return (await this.q("SELECT * FROM scala_fb_private.jobs WHERE page=$1 AND status IN ('queued','sending','uncertain') AND next_at<=$2 ORDER BY at,id LIMIT 1",this.page,this.now()))[0]??null;}
  async mark(job,status,{replyId=null,delay=0}={}){await this.q('UPDATE scala_fb_private.jobs SET status=$1,reply_id=COALESCE($2,reply_id),next_at=$3 WHERE page=$4 AND id=$5',status,replyId,this.now()+delay,this.page,job.id);}
  async beginSend(job,holder){
    const now=this.now(),day=Math.floor(now/DAY)*DAY;
    const rows=await this.q(`UPDATE scala_fb_private.jobs SET status='sending',attempt_at=$1,next_at=$2
      WHERE page=$3 AND id=$4 AND status='queued'
      AND EXISTS(SELECT 1 FROM scala_fb_private.metadata WHERE page=$3 AND key='ready' AND value='1')
      AND EXISTS(SELECT 1 FROM scala_fb_private.metadata WHERE page=$3 AND key='enabled' AND value='1')
      AND EXISTS(SELECT 1 FROM scala_fb_private.locks WHERE page=$3 AND holder=$5 AND until_at>$1)
      AND (SELECT count(*) FROM scala_fb_private.jobs WHERE page=$3 AND attempt_at>=$6 AND status IN ('sent','sending','uncertain','answered'))<100
      AND (SELECT count(*) FROM scala_fb_private.jobs WHERE page=$3 AND author=$7 AND attempt_at>=$6 AND status IN ('sent','sending','uncertain','answered'))<3
      AND NOT EXISTS(SELECT 1 FROM scala_fb_private.jobs WHERE page=$3 AND author=$7 AND attempt_at>$8 AND status IN ('sent','sending','uncertain','answered'))
      RETURNING id`,now,now+60000,this.page,job.id,holder,day,job.author,now-300000);
    return rows.length===1;
  }
  async paused(peer){return (await this.q('SELECT 1 FROM scala_fb_private.paused WHERE page=$1 AND peer=$2',this.page,peer)).length>0;}
  async pause(peer){await this.q('INSERT INTO scala_fb_private.paused VALUES($1,$2) ON CONFLICT DO NOTHING',this.page,peer);}
  async cleanup(){await this.q('DELETE FROM scala_fb_private.jobs WHERE page=$1 AND at<$2',this.page,this.now()-30*DAY);}
}
