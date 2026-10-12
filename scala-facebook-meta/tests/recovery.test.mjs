import test from 'node:test';
import assert from 'node:assert/strict';
import {PAGE_ID,REPLY} from '../src/policy.mjs';
import {processJob} from '../src/worker.mjs';

test('una copia humana del mensaje no se usa como prueba de un envío incierto del bot',async()=>{
  const marked=[],logs=[];
  const job={id:'1113975274440060',status:'uncertain',attemptAt:Date.now()-1000};
  const reply={id:'1433778465371696',from:{id:PAGE_ID},parent:{id:job.id},message:REPLY};
  let posts=0;
  await processJob(job,{store:{mark:(...args)=>marked.push(args)},graph:{replies:async()=>[reply],
    call:async()=>({...reply,created_time:new Date().toISOString()}),reply:async()=>{posts++;}},log:line=>logs.push(line)});
  assert.equal(posts,0);assert.equal(marked[0][1],'uncertain');assert.equal(logs.includes('META_REPLY_CONFIRMED'),false);
});

test('con un ID de respuesta conocido se exige ese ID y no otra respuesta idéntica',async()=>{
  const marked=[];
  const job={id:'1113975274440060',status:'uncertain',replyId:'9999999999999'};
  const reply={id:'1433778465371696',from:{id:PAGE_ID},parent:{id:job.id},message:REPLY};
  await processJob(job,{store:{mark:(...args)=>marked.push(args)},graph:{replies:async()=>[reply]}});
  assert.equal(marked[0][1],'uncertain');
});
