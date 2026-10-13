import test from 'node:test';
import assert from 'node:assert/strict';
import {createService,PAGE_ID,BASE,SLUG} from '../src/worker.mjs';
import {APP_ID,PAGE_NAME,SCOPES,REPLY,hmac} from '../src/meta.mjs';
const NOW=Date.parse('2026-10-13T01:30:00Z'),AUTHOR='777777777777777',POST=PAGE_ID+'_222222222222222',COMMENT='333333333333333',REPLY_ID='444444444444444';
const keys=()=>({app_secret:'a'.repeat(32),page_token:'EAATEST_FICTICIO_NO_UTILIZABLE',verify_token:'verificacion_ficticia_para_pruebas_1234',wake_token:'b'.repeat(64),peer_key:'c'.repeat(64),enabled:true});
class MemoryStore{
  constructor(k=keys()){this.k=k;this.meta=new Map([['enabled','1']]);this.jobs=new Map();this.optout=new Set();this.holder=null;this.credentialReads=0;}
  async credentials(){this.credentialReads++;return this.k;}
  async get(k){return this.meta.get(k)??null;}
  async set(k,v){this.meta.set(k,String(v));}
  async enqueue(events,{retrySkipped=false}={}){let queued=0;for(const e of events){const j=this.jobs.get(e.id);if(!j){this.jobs.set(e.id,{...e,text_hash:e.textHash,status:'queued',next_at:NOW,reply_id:null});queued++;}else if(retrySkipped&&j.status==='skipped'&&j.attempt_at==null&&j.post===e.post&&j.text_hash===e.textHash&&j.at===e.at){j.status='queued';j.next_at=NOW;queued++;}}return queued;}
  async lock(){if(this.holder)return null;return this.holder=crypto.randomUUID();}
  async renew(holder){assert.equal(this.holder,holder);}
  async unlock(holder){assert.equal(this.holder,holder);this.holder=null;}
  async next(){return [...this.jobs.values()].find(j=>['queued','sending','uncertain'].includes(j.status)&&j.next_at<=NOW)??null;}
  async mark(job,status,{replyId=null,delay=0}={}){const j=this.jobs.get(job.id);j.status=status;j.reply_id=replyId??j.reply_id;j.next_at=NOW+delay;}
  async beginSend(job,holder){assert.equal(holder,this.holder);if(job.status!=='queued'||this.meta.get('ready')!=='1'||!this.k.enabled)return false;job.status='sending';return true;}
  async paused(peer){return this.optout.has(peer);}
  async pause(peer){this.optout.add(peer);}
  async cleanup(){}
}
const event=()=>({object:'page',entry:[{id:PAGE_ID,changes:[{field:'feed',value:{item:'comment',verb:'add',comment_id:COMMENT,post_id:POST,parent_id:POST,from:{id:AUTHOR},message:'Quiero saber más',created_time:NOW/1000}}]}]});
function graphMock({wrongPage=false,loseReply=false,pageName=PAGE_NAME,hideAuthor=false,nested=false,wrongPostOwner=false}={}){
  let sends=0,subscribed=false,published=false;
  const proof=()=>({id:REPLY_ID,from:{id:PAGE_ID},parent:{id:COMMENT},message:REPLY});
  const original=()=>({id:COMMENT,...(!hideAuthor?{from:{id:AUTHOR}}:{}),...(nested?{parent:{id:'888888888888888'}}:{}),message:'Quiero saber más',created_time:new Date(NOW).toISOString(),is_hidden:false,is_private:false});
  return {get sends(){return sends;},fetch:async(url,options)=>{
    assert.equal(url.origin,'https://graph.facebook.com');assert.equal(options.redirect,'error');
    const p=url.pathname.replace(/^\/v26\.0\//,'');
    if(p===APP_ID)return Response.json({id:APP_ID});
    if(p==='debug_token')return Response.json({data:{is_valid:true,app_id:APP_ID,type:'PAGE',scopes:SCOPES}});
    if(p==='me')return Response.json({id:wrongPage?AUTHOR:PAGE_ID,name:pageName});
    if(p===APP_ID+'/subscriptions'){
      if(options.method==='POST'){assert.equal(options.body.get('callback_url'),BASE+'/webhook');return Response.json({success:true});}
      return Response.json({data:[{object:'page',active:true,callback_url:BASE+'/webhook',fields:[{name:'feed'}]}]});
    }
    if(p===PAGE_ID+'/subscribed_apps'){
      if(options.method==='POST'){subscribed=true;return Response.json({success:true});}
      return Response.json({data:subscribed?[{id:APP_ID,subscribed_fields:['feed']}]:[]});
    }
    if(p===POST)return Response.json({id:POST,from:{id:wrongPostOwner?AUTHOR:PAGE_ID}});
    if(p===POST+'/comments')return Response.json({data:[original()]});
    if(p===COMMENT)return Response.json(original());
    if(p===REPLY_ID)return Response.json(proof());
    if(p===COMMENT+'/comments'){
      if(options.method==='POST'){sends++;published=true;if(loseReply)throw new Error('conexión perdida');assert.equal(options.body.get('message'),REPLY);return Response.json({id:REPLY_ID});}
      return Response.json({data:published?[proof()]:[]});
    }
    assert.fail('Ruta inesperada');
  }};
}
async function signedRequest(body=JSON.stringify(event())){return new Request(BASE+'/webhook',{method:'POST',body,headers:{'x-hub-signature-256':'sha256='+await hmac(keys().app_secret,body)}});}

test('el servicio publicado permanece desactivado cuando faltan las claves de Meta',async()=>{
  const store=new MemoryStore({...keys(),app_secret:undefined,page_token:undefined,enabled:false});let calls=0;
  const app=createService({store,fetchFn:async()=>{calls++;assert.fail();},now:()=>NOW,log:()=>{}});
  const s=await app.status();assert.equal(s.estado,'credenciales_meta_pendientes');assert.equal(s.respuestasHabilitadas,false);await app.run();assert.equal(calls,0);
  const r=await app.fetch(new Request(BASE),{});assert.equal(r.status,200);assert.match(await r.text(),/Falta vincular Facebook/);
});
test('las rutas aceptan el prefijo del Gateway y los enlaces de privacidad apuntan a la función',async()=>{
  const app=createService({store:new MemoryStore({...keys(),enabled:false}),now:()=>NOW,log:()=>{}});
  for(const prefix of [BASE,'https://edge.example/'+SLUG,'https://edge.example'])assert.equal((await app.fetch(new Request(prefix+'/health'),{})).status,200);
  const html=await(await app.fetch(new Request(BASE),{})).text();assert.ok(html.includes(BASE+'/privacidad'));
  assert.equal((await app.fetch(new Request(BASE+'/ruta-inventada'),{})).status,404);
});
test('la verificación de Meta admite sólo el token y desafío exactos',async()=>{
  const store=new MemoryStore(),app=createService({store,now:()=>NOW,log:()=>{}}),url=new URL(BASE+'/webhook');
  url.searchParams.set('hub.mode','subscribe');url.searchParams.set('hub.verify_token',keys().verify_token);url.searchParams.set('hub.challenge','12345');
  assert.equal(await(await app.fetch(new Request(url),{})).text(),'12345');
  url.searchParams.append('hub.challenge','otro');assert.equal((await app.fetch(new Request(url),{})).status,403);
});
test('avisos sin firma se rechazan antes de consultar claves o base',async()=>{
  const store=new MemoryStore(),app=createService({store,now:()=>NOW,log:()=>{}});
  const r=await app.fetch(new Request(BASE+'/webhook',{method:'POST',body:JSON.stringify(event())}),{waitUntil:()=>assert.fail()});
  assert.equal(r.status,403);assert.equal(store.credentialReads,0);assert.equal(store.jobs.size,0);
});
test('un cuerpo alterado o mayor al límite no crea trabajos ni despierta al bot',async()=>{
  const store=new MemoryStore(),app=createService({store,now:()=>NOW,log:()=>{}});
  const original=await signedRequest(),invalid=new Request(BASE+'/webhook',{method:'POST',body:'{}',headers:original.headers});
  assert.equal((await app.fetch(invalid,{waitUntil:()=>assert.fail()})).status,403);
  const big=new Request(BASE+'/webhook',{method:'POST',body:'x'.repeat(262145),headers:{'x-hub-signature-256':'sha256='+('a'.repeat(64))}});
  assert.equal((await app.fetch(big,{waitUntil:()=>assert.fail()})).status,413);assert.equal(store.jobs.size,0);
});
test('la recuperación sólo admite el secreto privado y no lo muestra en el estado',async()=>{
  const store=new MemoryStore({...keys(),enabled:false}),app=createService({store,now:()=>NOW,log:()=>{}}),waits=[];
  const invalid=await app.fetch(new Request(BASE+'/wake',{method:'POST',headers:{'x-scala-wake':'d'.repeat(64)}}),{waitUntil:p=>waits.push(p)});assert.equal(invalid.status,403);assert.equal(waits.length,0);
  const valid=await app.fetch(new Request(BASE+'/wake',{method:'POST',headers:{'x-scala-wake':keys().wake_token}}),{waitUntil:p=>waits.push(p)});assert.equal(valid.status,200);await Promise.all(waits);
  assert.doesNotMatch(JSON.stringify(await app.status()),new RegExp(keys().wake_token));
});
test('otra Página con el mismo nombre deja las respuestas desactivadas',async()=>{
  const store=new MemoryStore(),graph=graphMock({wrongPage:true}),app=createService({store,fetchFn:graph.fetch,now:()=>NOW,log:()=>{}});
  await app.run();assert.equal((await app.status()).respuestasHabilitadas,false);assert.equal(graph.sends,0);
});
test('renombrar la Página autorizada permite reconectar y responder un comentario',async()=>{
  const store=new MemoryStore(),graph=graphMock({pageName:'SCALA cuentos para niños'}),app=createService({store,fetchFn:graph.fetch,now:()=>NOW,log:()=>{}}),waits=[];
  store.meta.set('ready','0');
  await app.run();assert.equal((await app.status()).respuestasHabilitadas,true);
  assert.equal((await app.fetch(await signedRequest(),{waitUntil:p=>waits.push(p)})).status,200);
  await Promise.all(waits);await app.run();
  assert.equal(graph.sends,1);assert.equal(store.jobs.get(COMMENT).status,'sent');
});
test('un comentario de video con autor omitido y parent_id de video se responde una sola vez',async()=>{
  const store=new MemoryStore(),graph=graphMock({hideAuthor:true}),app=createService({store,fetchFn:graph.fetch,now:()=>NOW,log:()=>{}}),waits=[],payload=event();
  delete payload.entry[0].changes[0].value.from;payload.entry[0].changes[0].value.parent_id='999999999999999';
  await app.run();
  for(let i=0;i<2;i++)assert.equal((await app.fetch(await signedRequest(JSON.stringify(payload)),{waitUntil:p=>waits.push(p)})).status,200);
  await Promise.all(waits);await app.run();
  assert.equal(store.jobs.get(COMMENT).author,'comment:'+COMMENT);assert.equal(store.jobs.get(COMMENT).status,'sent');assert.equal(graph.sends,1);
});
test('un aviso sin autor no permite responder a un comentario anidado',async()=>{
  const store=new MemoryStore(),graph=graphMock({hideAuthor:true,nested:true}),app=createService({store,fetchFn:graph.fetch,now:()=>NOW,log:()=>{}}),waits=[],payload=event();
  delete payload.entry[0].changes[0].value.from;
  await app.run();await app.fetch(await signedRequest(JSON.stringify(payload)),{waitUntil:p=>waits.push(p)});await Promise.all(waits);await app.run();
  assert.equal(store.jobs.get(COMMENT).status,'skipped');assert.equal(graph.sends,0);
});
test('recuperar un aviso perdido requiere el secreto privado y la publicación de la Página vinculada',async()=>{
  const store=new MemoryStore(),graph=graphMock({hideAuthor:true}),app=createService({store,fetchFn:graph.fetch,now:()=>NOW,log:()=>{}}),waits=[];
  await app.run();
  const request=(post,token)=>new Request(BASE+'/recover',{method:'POST',headers:{'Content-Type':'application/json','x-scala-wake':token},body:JSON.stringify({post})});
  assert.equal((await app.fetch(request(POST,'d'.repeat(64)),{waitUntil:()=>assert.fail()})).status,403);
  assert.equal((await app.fetch(request(AUTHOR+'_222222222222222',keys().wake_token),{waitUntil:()=>assert.fail()})).status,400);
  assert.equal(store.jobs.size,0);assert.equal(graph.sends,0);
  const recovered=await app.fetch(request(POST,keys().wake_token),{waitUntil:p=>waits.push(p)});
  assert.equal(recovered.status,200);assert.deepEqual(await recovered.json(),{received:true,queued:1});
  await Promise.all(waits);await app.run();assert.equal(store.jobs.get(COMMENT).status,'sent');assert.equal(graph.sends,1);
});
test('la recuperación reintenta un comentario descartado sin enviar dos veces uno ya atendido',async()=>{
  const store=new MemoryStore(),graph=graphMock({hideAuthor:true}),app=createService({store,fetchFn:graph.fetch,now:()=>NOW,log:()=>{}}),waits=[];
  await app.run();await store.enqueue(await (await import('../src/meta.mjs')).eventsFrom(event(),{page:PAGE_ID,since:NOW,now:NOW}));
  await store.mark(store.jobs.get(COMMENT),'skipped');
  const request=()=>new Request(BASE+'/recover',{method:'POST',headers:{'x-scala-wake':keys().wake_token},body:JSON.stringify({post:POST})});
  const first=await app.fetch(request(),{waitUntil:p=>waits.push(p)});assert.equal((await first.json()).queued,1);await Promise.all(waits);await app.run();
  const second=await app.fetch(request(),{waitUntil:p=>waits.push(p)});assert.equal((await second.json()).queued,0);await Promise.all(waits);await app.run();
  assert.equal(store.jobs.get(COMMENT).status,'sent');assert.equal(graph.sends,1);
});
test('la recuperación no autoriza una publicación cuyo dueño es otra Página',async()=>{
  const store=new MemoryStore(),graph=graphMock({hideAuthor:true,wrongPostOwner:true}),app=createService({store,fetchFn:graph.fetch,now:()=>NOW,log:()=>{}});
  await app.run();
  const r=await app.fetch(new Request(BASE+'/recover',{method:'POST',headers:{'x-scala-wake':keys().wake_token},body:JSON.stringify({post:POST})}),{waitUntil:()=>assert.fail()});
  assert.equal(r.status,503);assert.equal(store.jobs.size,0);assert.equal(graph.sends,0);
});
test('un aviso firmado repetido genera una respuesta confirmada y no afirma acceso público',async()=>{
  const store=new MemoryStore(),graph=graphMock(),app=createService({store,fetchFn:graph.fetch,now:()=>NOW,log:()=>{}}),waits=[];
  await app.run();assert.equal((await app.status()).respuestasHabilitadas,true);
  for(let i=0;i<2;i++)assert.equal((await app.fetch(await signedRequest(),{waitUntil:p=>waits.push(p)})).status,200);
  await Promise.all(waits);await app.run();assert.equal(store.jobs.size,1);assert.equal(graph.sends,1);
  const s=await app.status();assert.equal(s.respuestaAutonomaVerificada,true);assert.equal(s.publicoGeneralVerificado,false);
  await store.set('external_verified_reply_id',REPLY_ID);
  const verified=await app.status();assert.equal(verified.publicoGeneralVerificado,true);assert.equal(verified.estado,'activa');
});
test('si se pierde el resultado del envío no se vuelve a publicar ni se inventa confirmación',async()=>{
  const store=new MemoryStore(),graph=graphMock({loseReply:true}),app=createService({store,fetchFn:graph.fetch,now:()=>NOW,log:()=>{}}),waits=[];
  await app.run();await app.fetch(await signedRequest(),{waitUntil:p=>waits.push(p)});await Promise.all(waits);await app.run();
  assert.equal(graph.sends,1);assert.equal((await app.status()).respuestaAutonomaVerificada,false);
});
