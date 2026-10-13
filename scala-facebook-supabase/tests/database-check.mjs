// Emits a reversible PostgreSQL check using the actual PgStore statements.
import {PgStore} from '../src/store.mjs';
import {PAGE_ID} from '../src/worker.mjs';
const now=Date.parse('2026-10-13T01:30:00Z'),comment='980000000000001',author='980000000000003';
const calls=[],sql={unsafe:async(query,values)=>{calls.push({query,values});return [{holder:values[1],id:comment}];}};
const store=new PgStore(sql,()=>now),holder=await store.lock();await store.beginSend({id:comment,author},holder);
const literal=v=>typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const render=({query,values})=>query.replace(/\$(\d+)\b/g,(_,n)=>literal(values[Number(n)-1]));
const first=render(calls[0]),second=render({...calls[0],values:[PAGE_ID,crypto.randomUUID(),now+45000,now]}),begin=render(calls[1]);
const otherComment='980000000000002',otherAuthor='980000000000004';
const otherBegin=render({...calls[1],values:calls[1].values.map(v=>v===comment?otherComment:v===author?otherAuthor:v)});
const test=`BEGIN;
DO $check$
DECLARE got_holder uuid; got_id text;
BEGIN
  IF has_schema_privilege('anon','scala_fb_private','USAGE') OR has_table_privilege('anon','scala_fb_private.jobs','SELECT') OR has_table_privilege('authenticated','scala_fb_private.jobs','SELECT') THEN RAISE EXCEPTION 'bot_tables_exposed'; END IF;
  UPDATE scala_fb_private.metadata SET value='1' WHERE page='${PAGE_ID}' AND key IN ('enabled','ready');
  DELETE FROM scala_fb_private.locks WHERE page='${PAGE_ID}';
  INSERT INTO scala_fb_private.jobs VALUES('${PAGE_ID}','${comment}','${PAGE_ID}_980000000000005',${now},'${author}',repeat('a',64),'queued',${now},NULL,NULL);
  INSERT INTO scala_fb_private.jobs VALUES('${PAGE_ID}','${comment}','${PAGE_ID}_980000000000005',${now},'${author}',repeat('a',64),'queued',${now},NULL,NULL) ON CONFLICT DO NOTHING;
  IF (SELECT count(*) FROM scala_fb_private.jobs WHERE page='${PAGE_ID}' AND id='${comment}')<>1 THEN RAISE EXCEPTION 'duplicate_job'; END IF;
  EXECUTE ${literal(first)} INTO got_holder;
  IF got_holder IS DISTINCT FROM '${holder}'::uuid THEN RAISE EXCEPTION 'first_lease_failed'; END IF;
  got_holder:=NULL; EXECUTE ${literal(second)} INTO got_holder;
  IF got_holder IS NOT NULL THEN RAISE EXCEPTION 'double_lease'; END IF;
  EXECUTE ${literal(begin)} INTO got_id;
  IF got_id IS DISTINCT FROM '${comment}' THEN RAISE EXCEPTION 'reservation_failed'; END IF;
  got_id:=NULL; EXECUTE ${literal(begin)} INTO got_id;
  IF got_id IS NOT NULL THEN RAISE EXCEPTION 'double_send'; END IF;
  INSERT INTO scala_fb_private.jobs VALUES('${PAGE_ID}','${otherComment}','${PAGE_ID}_980000000000005',${now},'${otherAuthor}',repeat('a',64),'queued',${now},NULL,NULL);
  UPDATE scala_fb_private.locks SET until_at=${now-1} WHERE page='${PAGE_ID}';
  got_id:=NULL; EXECUTE ${literal(otherBegin)} INTO got_id;
  IF got_id IS NOT NULL THEN RAISE EXCEPTION 'expired_lease_sent'; END IF;
  UPDATE scala_fb_private.locks SET until_at=${now+45000} WHERE page='${PAGE_ID}';
  INSERT INTO scala_fb_private.jobs(page,id,post,at,author,text_hash,status,next_at,attempt_at)
    SELECT '${PAGE_ID}',(980000000000100+g)::text,'${PAGE_ID}_980000000000005',${now-600000},'980000000000009',repeat('a',64),'sent',${now},${now-600000} FROM generate_series(1,99) g;
  got_id:=NULL; EXECUTE ${literal(otherBegin)} INTO got_id;
  IF got_id IS NOT NULL THEN RAISE EXCEPTION 'daily_budget_exceeded'; END IF;
END $check$;
ROLLBACK;`;
process.stdout.write(JSON.stringify({query:test}));
