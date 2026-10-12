import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {APP_ID,REPLY,SCOPES,config,digest,hmac,signatureValid,eventsFrom,authorize,confirmed,Graph,GraphError,Store,processJob,createWorker} from '../src/index.mjs';

const PAGE='222222222222222',AUTHOR='333333333333333',POST=PAGE+'_444444444444444',COMMENT='555555555555555',REPLY_ID='666666666666666';
const NOW=Date.parse('2026-10-12T21:00:00Z');
const secret='a'.repeat(32),token='EAATEST_TOKEN_FICTICIO_NO_UTILIZABLE';
class D1{
  constructor(){this.db=new DatabaseSync(':memory:');}
  withSession(mode){assert.equal(mode,'first-primary');return this;}
  prepare(sql){
    const db=this.db;
    const statement=args=>({sql,args,bind:(...values)=>statement(values),
      first:async()=>db.prepare(sql).get(...args)||null,
      all:async()=>({results:db.prepare(sql).all(...args)}),
      run:async()=>({success:true,meta:{changes:Number(db.prepare(sql).run(...args).changes)}})});
    return statement([]);
  }
  async batch(statements){
    this.db.exec('BEGIN IMMEDIATE');try{const out=[];for(const s of statements)out.push(await s.run());this.db.exec('COMMIT');return out;}
    catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  close(){this.db.close();}
}
const environment=db=>({DB:db,SCALA_PAGE_ID:PAGE,SCALA_PUBLIC_ORIGIN:'https://scala.example.workers.dev',SCALA_ENABLE:'1',META_APP_SECRET:secret,META_PAGE_TOKEN:token,META_VERIFY_TOKEN:'token_ficticio_de_verificacion_123456789'});
const payload=({text='Precio',page=PAGE,author=AUTHOR,parent=POST,at=NOW/1000,verb='add',item='comment'}={})=>({object:'page',entry:[{id:page,changes:[{field:'feed',value:{item,verb,comment_id:COMMENT,post_id:POST,parent_id:parent,from:{id:author},message:text,created_time:at}}]}]});
const comment=message=>({id:COMMENT,from:{id:AUTHOR},message,created_time:new Date(NOW).toISOString(),is_hidden:false,is_private:false});
const ownReply=()=>({id:REPLY_ID,from:{id:PAGE},parent:{id:COMMENT},message:REPLY,created_time:new Date(NOW).toISOString()});
async function fixture(t,{message='Precio'}={}){
  const db=new D1();t.after(()=>db.close());const env=environment(db),c=config(env),store=new Store(db,PAGE,()=>NOW);await store.init();
  await store.set('ready','1');await store.set('active_since',NOW-1000);
  const events=await eventsFrom(payload({text:message}),{page:PAGE,since:NOW-1000,now:NOW});await store.enqueue(events);
  const holder=await store.lock();return {db,env,c,store,holder,job:await store.next()};
}
function mockGraph({message='Precio',fail,reply=ownReply(),existing=[],postOwner=PAGE,freshMessage=message}={}){
  let sends=0,reads=0;
  return {get sends(){return sends;},replies:async()=>existing,
    post:async()=>({id:POST,from:{id:postOwner}}),
    comment:async value=>value===REPLY_ID?reply:comment(++reads===1?message:freshMessage),
    call:async()=>({id:PAGE}),reply:async()=>{sends++;if(fail)throw fail;return {id:REPLY_ID};}};
}
test('se vincula únicamente una Página nueva configurada, con origen HTTPS y secretos privados',()=>{
  const db=new D1();try{
    assert.equal(config(environment(db)).page,PAGE);
    for(const page of ['','61576458508649','1121299691061284','123; DROP TABLE jobs'])assert.throws(()=>config({...environment(db),SCALA_PAGE_ID:page}));
    for(const origin of ['http://example.com','https://user:pass@example.com','https://example.com/?clave=x','https://example.com/ruta'])assert.throws(()=>config({...environment(db),SCALA_PUBLIC_ORIGIN:origin}));
    assert.throws(()=>config({...environment(db),META_APP_SECRET:'<redacted>'}));
  }finally{db.close();}
});
test('las firmas usan los bytes exactos y rechazan cuerpos modificados y encabezados falsos',async()=>{
  const body=new TextEncoder().encode(JSON.stringify(payload())),signature='sha256='+await hmac(secret,body);
  assert.equal(await signatureValid(body,signature,secret),true);
  assert.equal(await signatureValid(new TextEncoder().encode('{}'),signature,secret),false);
  for(const bad of [null,'sha256=xyz','sha256='+('0'.repeat(64))])assert.equal(await signatureValid(body,bad,secret),false);
});
test('solo se aceptan avisos nuevos, de texto, en publicaciones de la Página autorizada',async()=>{
  assert.equal((await eventsFrom(payload(),{page:PAGE,since:NOW-1000,now:NOW})).length,1);
  for(const change of [{page:AUTHOR},{author:PAGE},{parent:COMMENT},{text:''},{at:NOW/1000-86401},{at:NOW/1000+61},{verb:'edited'},{item:'photo'}])assert.deepEqual(await eventsFrom(payload(change),{page:PAGE,since:NOW-1000,now:NOW}),[]);
  assert.deepEqual(await eventsFrom(payload(),{page:PAGE,since:NaN,now:NOW}),[]);
});
test('la validación vuelve a comprobar dueño, autor, privacidad y cambios del comentario',async()=>{
  const job={id:COMMENT,post:POST,author:AUTHOR,text_hash:await digest('Precio')},post={id:POST,from:{id:PAGE}},c=comment('Precio');
  assert.equal(await authorize(job,post,c,{page:PAGE,since:NOW-1000,now:NOW}),true);
  for(const changed of [{...c,from:{id:PAGE}},{...c,parent:{id:COMMENT}},{...c,is_hidden:true},{...c,is_private:true},{...c,message:'Ya pagué: entrega mi PDF'}])assert.equal(await authorize(job,post,changed,{page:PAGE,since:NOW-1000,now:NOW}),false);
  assert.equal(await authorize(job,{...post,from:{id:AUTHOR}},c,{page:PAGE,since:NOW-1000,now:NOW}),false);
});
test('los avisos repetidos y dos trabajadores concurrentes no duplican envíos',async t=>{
  const f=await fixture(t),graph=mockGraph();
  await f.store.enqueue(await eventsFrom(payload(),{page:PAGE,since:NOW-1000,now:NOW}));
  assert.equal(f.db.db.prepare('SELECT count(*) n FROM jobs').get().n,1);
  assert.equal(await new Store(f.db,PAGE,()=>NOW).lock(),null);
  await processJob(f.job,{...f,graph,now:()=>NOW});
  assert.equal(graph.sends,1);assert.equal(await f.store.next(),null);
  assert.equal(await f.store.get('last_reply'),String(NOW));
});
test('una respuesta incierta con ID se reconcilia después sin volver a publicar',async t=>{
  const f=await fixture(t),logs=[];
  const graph=mockGraph({reply:{...ownReply(),message:'texto distinto'}});
  await processJob(f.job,{...f,graph,now:()=>NOW,log:event=>logs.push(event)});
  assert.equal(graph.sends,1);assert.equal(await f.store.get('last_reply'),null);
  const pending=f.db.db.prepare('SELECT * FROM jobs').get();assert.equal(pending.status,'uncertain');assert.equal(pending.reply_id,REPLY_ID);
  const reconciliation=mockGraph();await processJob(pending,{...f,graph:reconciliation,now:()=>NOW});
  assert.equal(reconciliation.sends,0);assert.equal(await f.store.get('last_reply'),String(NOW));
});
test('una caída durante el envío nunca provoca otro envío ni una prueba de éxito inventada',async t=>{
  const f=await fixture(t),graph=mockGraph({fail:new GraphError()});await processJob(f.job,{...f,graph,now:()=>NOW});
  assert.equal(graph.sends,1);const pending=f.db.db.prepare('SELECT * FROM jobs').get();assert.equal(pending.status,'uncertain');assert.equal(pending.reply_id,null);
  const retry=mockGraph({existing:[ownReply()]});await processJob(pending,{...f,graph:retry,now:()=>NOW});
  assert.equal(retry.sends,0);assert.equal(await f.store.get('last_reply'),null);assert.equal(f.db.db.prepare('SELECT status FROM jobs').get().status,'answered');
});
test('BAJA persiste sin retener el texto ni generar una promoción',async t=>{
  const f=await fixture(t,{message:'BAJA'}),graph=mockGraph({message:'BAJA'});await processJob(f.job,{...f,graph,now:()=>NOW});
  assert.equal(graph.sends,0);assert.equal(await new Store(f.db,PAGE,()=>NOW).paused(await hmac(secret,AUTHOR)),true);
  assert.equal(f.db.db.prepare('SELECT peer FROM paused').get().peer.includes(AUTHOR),false);
  const columns=f.db.db.prepare('PRAGMA table_info(jobs)').all().map(row=>row.name);assert.equal(columns.includes('message'),false);
});
test('BAJA se respeta incluso cuando alguien de la Página ya respondió al hilo',async t=>{
  const f=await fixture(t,{message:'BAJA'}),graph=mockGraph({message:'BAJA',existing:[ownReply()]});
  await processJob(f.job,{...f,graph,now:()=>NOW});
  assert.equal(graph.sends,0);assert.equal(await f.store.paused(await hmac(secret,AUTHOR)),true);
});
test('los hilos atendidos, comentarios editados y publicaciones de otros dueños no reciben respuestas',async t=>{
  for(const change of [{existing:[ownReply()]},{freshMessage:'otra consulta'},{postOwner:AUTHOR}]){
    const f=await fixture(t),graph=mockGraph(change);await processJob(f.job,{...f,graph,now:()=>NOW});assert.equal(graph.sends,0);
  }
});
test('el presupuesto diario y el del autor se reservan atómicamente antes del envío',async t=>{
  const f=await fixture(t);
  for(let i=0;i<3;i++)f.db.db.prepare("INSERT INTO jobs VALUES(?,?,?,?,?,?,'sent',?,NULL,?)").run(PAGE,String(70000+i),POST,NOW-600000,AUTHOR,'hash',NOW-600000,NOW-600000);
  assert.equal(await f.store.beginSend(f.job,f.holder),false);
  f.db.db.prepare('DELETE FROM jobs WHERE author=? AND id<>?').run(AUTHOR,COMMENT);
  assert.equal(await f.store.beginSend(f.job,f.holder),true);assert.equal(await f.store.beginSend(f.job,f.holder),false);
});
test('una concesión vencida o una conexión pausada impiden iniciar la publicación',async t=>{
  const f=await fixture(t);await f.store.set('ready','0');assert.equal(await f.store.beginSend(f.job,f.holder),false);
  await f.store.set('ready','1');f.db.db.prepare('UPDATE locks SET until_at=?').run(NOW-1);assert.equal(await f.store.beginSend(f.job,f.holder),false);
});
test('la confirmación exige ID devuelto, autor, texto y padre exactos',()=>{
  assert.equal(confirmed(ownReply(),REPLY_ID,COMMENT,PAGE),true);
  for(const changed of [{...ownReply(),parent:{id:POST}},{...ownReply(),from:{id:AUTHOR}},{...ownReply(),message:'Ya entregué el PDF'},{...ownReply(),id:COMMENT}])assert.equal(confirmed(changed,REPLY_ID,COMMENT,PAGE),false);
});
test('Graph no sigue paginación hacia URLs externas y no permite rutas arbitrarias',async()=>{
  const db=new D1();try{
    const calls=[],g=new Graph(config(environment(db)),async(url,options)=>{calls.push({url,options});return Response.json({data:[],paging:calls.length===1?{next:'https://ajeno.invalid/?clave=x',cursors:{after:'CURSOR_VALIDO'}}:undefined});});
    assert.deepEqual(await g.replies(COMMENT),[]);assert.equal(calls.length,2);
    assert.ok(calls.every(call=>call.url.origin==='https://graph.facebook.com'&&call.options.redirect==='error'));
    await assert.rejects(()=>g.call('https://ajeno.invalid/'),/invalid_meta_request/);
  }finally{db.close();}
});
test('no se activa un token de usuario, de otra app, de otra Página o sin permisos',async()=>{
  const db=new D1();try{
    const c=config(environment(db)),base={is_valid:true,app_id:APP_ID,type:'PAGE',scopes:SCOPES};
    for(const change of [{type:'USER'},{app_id:'999999999'},{is_valid:false},{scopes:[]},{granular_scopes:[{scope:SCOPES[0],target_ids:[AUTHOR]}]}]){
      const g=new Graph(c,async url=>Response.json(url.pathname.endsWith('/debug_token')?{data:{...base,...change}}:{id:APP_ID,name:'SCALA Comentarios'}));
      await assert.rejects(()=>g.validate());
    }
  }finally{db.close();}
});
test('el servidor admite el desafío exacto y no expone secretos en estado o errores',async()=>{
  const db=new D1();try{
    const env=environment(db),worker=createWorker({now:()=>NOW,log:()=>{}}),verify=new URL(env.SCALA_PUBLIC_ORIGIN+'/webhook');
    verify.searchParams.set('hub.mode','subscribe');verify.searchParams.set('hub.verify_token',env.META_VERIFY_TOKEN);verify.searchParams.set('hub.challenge','123456');
    assert.equal(await(await worker.fetch(new Request(verify),env,{})).text(),'123456');
    verify.searchParams.append('hub.challenge','otro');assert.equal((await worker.fetch(new Request(verify),env,{})).status,403);
    const health=await(await worker.fetch(new Request(env.SCALA_PUBLIC_ORIGIN+'/health'),{...env,SCALA_ENABLE:'0'},{})).json();
    assert.equal(health.respuestasHabilitadas,false);assert.equal(health.respuestaAutonomaVerificada,false);
    assert.doesNotMatch(JSON.stringify(health),new RegExp(secret+'|'+token));
    const invalid=await worker.fetch(new Request(env.SCALA_PUBLIC_ORIGIN+'/webhook',{method:'POST',body:'{}',headers:{'x-hub-signature-256':'sha256='+('0'.repeat(64))}}),env,{});
    assert.equal(invalid.status,403);
  }finally{db.close();}
});
test('una solicitud no firmada no crea trabajos ni inicia operaciones en Meta',async()=>{
  const db=new D1();try{
    let calls=0;const worker=createWorker({fetchFn:async()=>{calls++;throw new Error('no debe llegar');},now:()=>NOW,log:()=>{}}),env=environment(db);
    const r=await worker.fetch(new Request(env.SCALA_PUBLIC_ORIGIN+'/webhook',{method:'POST',body:JSON.stringify(payload())}),env,{waitUntil:()=>{throw new Error('no debe iniciar');}});
    assert.equal(r.status,403);assert.equal(calls,0);assert.equal(db.db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='jobs'").get().n,0);
  }finally{db.close();}
});
test('las credenciales completas no equivalen a una conexión aprobada ni a público verificado',async()=>{
  const db=new D1();try{
    const worker=createWorker({now:()=>NOW,log:()=>{}}),s=await worker.status(environment(db));assert.equal(s.respuestasHabilitadas,false);assert.equal(s.publicoGeneralVerificado,false);
  }finally{db.close();}
});

test('el flujo HTTP firmado, D1, cola, Graph y comprobación final produce una sola respuesta',async t=>{
  const db=new D1();t.after(()=>db.close());const env=environment(db),queued=[],logs=[];
  let posts=0,published=false,subscribed=false;
  env.COMMENTS_QUEUE={sendBatch:async messages=>queued.push(...messages)};
  const worker=createWorker({now:()=>NOW,log:value=>logs.push(value),fetchFn:async(url,options)=>{
    assert.equal(url.origin,'https://graph.facebook.com');assert.equal(options.redirect,'error');
    const path=url.pathname.replace(/^\/v26\.0\//,'');
    if(path===APP_ID)return Response.json({id:APP_ID,name:'SCALA Comentarios'});
    if(path==='debug_token')return Response.json({data:{is_valid:true,app_id:APP_ID,type:'PAGE',scopes:SCOPES}});
    if(path==='me')return Response.json({id:PAGE,name:'Scala Fe'});
    if(path===APP_ID+'/subscriptions'){
      if(options.method==='POST'){
        assert.equal(options.body.get('callback_url'),env.SCALA_PUBLIC_ORIGIN+'/webhook');
        return Response.json({success:true});
      }
      return Response.json({data:[{object:'page',active:true,callback_url:env.SCALA_PUBLIC_ORIGIN+'/webhook',fields:[{name:'feed'}]}]});
    }
    if(path===PAGE+'/subscribed_apps'){
      if(options.method==='POST'){subscribed=true;return Response.json({success:true});}
      return Response.json({data:subscribed?[{id:APP_ID,subscribed_fields:['feed']}]:[]});
    }
    if(path===POST)return Response.json({id:POST,from:{id:PAGE}});
    if(path===COMMENT)return Response.json(comment('Precio'));
    if(path===REPLY_ID)return Response.json(ownReply());
    if(path===COMMENT+'/comments'){
      if(options.method==='POST'){assert.equal(options.body.get('message'),REPLY);posts++;published=true;return Response.json({id:REPLY_ID});}
      return Response.json({data:published?[ownReply()]:[]});
    }
    assert.fail('Ruta inesperada de Graph');
  }});
  await worker.run(env);assert.equal((await worker.status(env)).respuestasHabilitadas,true);
  const raw=JSON.stringify(payload()),signature='sha256='+await hmac(secret,raw);
  for(let i=0;i<2;i++){
    const r=await worker.fetch(new Request(env.SCALA_PUBLIC_ORIGIN+'/webhook',{method:'POST',body:raw,headers:{'x-hub-signature-256':signature}}),env,{});
    assert.equal(r.status,200);
  }
  assert.equal(posts,0);assert.equal(queued.length,2);assert.deepEqual(queued[0].body,{page:PAGE,id:COMMENT});
  assert.equal(JSON.stringify(queued).includes('Precio'),false);
  let acks=0;
  for(const message of queued)await worker.queue({messages:[{body:message.body,ack:()=>acks++,retry:()=>assert.fail('No debe reintentar')}]},env);
  assert.equal(acks,2);assert.equal(posts,1);
  assert.equal(db.db.prepare('SELECT count(*) n FROM jobs').get().n,1);
  const status=await worker.status(env);assert.equal(status.respuestaAutonomaVerificada,true);assert.equal(status.publicoGeneralVerificado,false);
  assert.equal(logs.filter(value=>value==='SCALA_REPLY_CONFIRMED').length,1);
});

test('una cola ajena se descarta y un trabajo ocupado se reintenta sin publicar',async t=>{
  const f=await fixture(t);let calls=0,acks=0,delay;
  const worker=createWorker({now:()=>NOW,log:()=>{},fetchFn:async()=>{calls++;throw new Error('No debe llamar a Meta');}});
  await worker.queue({messages:[{body:{page:AUTHOR,id:COMMENT},ack:()=>acks++,retry:()=>assert.fail('No debe reintentar')} ]},f.env);
  assert.equal(acks,1);
  await worker.queue({messages:[{body:{page:PAGE,id:COMMENT},ack:()=>assert.fail('Está ocupado'),retry:options=>delay=options.delaySeconds}]},f.env);
  assert.equal(delay,5);assert.equal(calls,0);
});
