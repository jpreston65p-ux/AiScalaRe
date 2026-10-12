import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHmac} from 'node:crypto';
import {PAGE_ID,APP_ID,REPLY,SCOPES,digest,signatureValid,commentEvents,authorizeComment,confirmedReply} from '../src/policy.mjs';
import {Graph,GraphError} from '../src/graph.mjs';
import {Store} from '../src/store.mjs';
import {processJob} from '../src/worker.mjs';
import {createApp,publicOrigin} from '../src/server.mjs';

const now=Date.now(),since=now-120000;
const event=()=>({comment_id:'1113975274440060',post_id:PAGE_ID+'_1079349435002481',parent_id:PAGE_ID+'_1079349435002481',
  item:'comment',verb:'add',message:'Quiero conocer el producto',from:{id:'123456789123'},created_time:Math.floor(now/1000)});
const packet=(value=event(),owner=PAGE_ID)=>({object:'page',entry:[{id:owner,changes:[{field:'feed',value}]}]});
const fixture=()=>{const dir=mkdtempSync(join(tmpdir(),'scala-meta-test-')),store=new Store(dir);return {store,dir,close:()=>{store.close();rmSync(dir,{recursive:true,force:true});}};};
const signed=(body,key)=>'sha256='+createHmac('sha256',key).update(body).digest('hex');
const job=()=>commentEvents(packet(),{since,now})[0];
const comment=()=>({id:job().id,from:{id:job().author},message:event().message,created_time:new Date(now).toISOString(),is_hidden:false,is_private:false});

test('solo una firma HMAC exacta valida el cuerpo original',()=>{
  const body=Buffer.from(JSON.stringify(packet())),key='CLAVE_FICTICIA';
  assert.equal(signatureValid(body,signed(body,key),key),true);
  for(const sign of [signed(body,'OTRA'),undefined,'sha256=123','sha1=123'])assert.equal(signatureValid(body,sign,key),false);
  assert.equal(signatureValid(Buffer.from('otro cuerpo'),signed(body,key),key),false);
});

test('solo los comentarios nuevos de primer nivel de la Página autorizada llegan a la cola',()=>{
  assert.equal(commentEvents(packet(),{since,now}).length,1);
  for(const change of [{item:'post'},{verb:'edited'},{parent_id:'9999999999'},{from:{id:PAGE_ID}},{message:''},
    {created_time:Math.floor((since-10000)/1000)},{created_time:Math.floor((now+120000)/1000)},
    {post_id:'https://ejemplo.invalid'},{comment_id:'../me'}, {from:null}])
    assert.deepEqual(commentEvents(packet({...event(),...change}),{since,now}),[]);
  assert.deepEqual(commentEvents(packet(event(),'9999999999999'),{since,now}),[]);
  assert.deepEqual(commentEvents(packet(),{now}),[]);
});

test('el texto, autor, propietario, edad y nivel del comentario se vuelven a verificar antes de responder',()=>{
  const j=job(),post={id:j.post,from:{id:PAGE_ID}},c=comment();
  assert.equal(authorizeComment(j,post,c,since,now),true);
  for(const change of [{parent:{id:'9999999999'}},{message:'Texto editado'},{from:{id:'9999999999'}},{is_hidden:true},
    {is_private:true},{created_time:'sin fecha'},{created_time:new Date(since-10000).toISOString()}])
    assert.equal(authorizeComment(j,post,{...c,...change},since,now),false);
  assert.equal(authorizeComment(j,{...post,from:{id:'9999999999'}},c,since,now),false);
});

test('la confirmación exige la respuesta propia con el texto y el padre correctos',()=>{
  const reply={id:'1433778465371696',from:{id:PAGE_ID},parent:{id:job().id},message:REPLY};
  assert.equal(confirmedReply(reply,reply.id,job().id),true);
  for(const change of [{parent:{id:'9999999999'}},{from:{id:'9999999999'}},{message:'Texto distinto'}])
    assert.equal(confirmedReply({...reply,...change},reply.id,job().id),false);
});

test('la cola deduplica avisos y conserva solo huellas del texto',()=>{
  const f=fixture();try{
    f.store.enqueue([job(),job()]);assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM jobs').get().n,1);
    assert.equal(f.store.next().textHash,digest(event().message));
    assert.equal(readFileSync(join(f.dir,'meta.sqlite')).includes(Buffer.from(event().message)),false);
  }finally{f.close();}
});

test('los límites y BAJA sobreviven al reinicio sin guardar el texto de la solicitud',()=>{
  const f=fixture();try{
    f.store.pause(job().author);assert.equal(f.store.allowed(job().author),false);
    const reopened=new Store(f.dir);assert.equal(reopened.allowed(job().author),false);reopened.close();
    assert.equal(f.store.allowed('9999999999'),true);
  }finally{f.close();}
});

function workerFixture({replyError,confirmationError,existing=[]}={}){
  const f=fixture();f.store.enqueue([job()]);let sent=0;const logs=[];
  const response={id:'1433778465371696',from:{id:PAGE_ID},parent:{id:job().id},message:REPLY};
  const graph={replies:async()=>existing,getPost:async()=>({id:job().post,from:{id:PAGE_ID}}),
    getComment:async id=>{if(id===response.id){if(confirmationError)throw confirmationError;return response;}return comment();},
    call:async()=>({id:PAGE_ID}),reply:async()=>{sent++;if(replyError)throw replyError;return {id:response.id};}};
  return {...f,graph,logs,sent:()=>sent,run:async()=>processJob(f.store.next(),{store:f.store,graph,since,log:line=>logs.push(line)})};
}

test('se publica una vez y solo una respuesta observada bajo el comentario se confirma',async()=>{
  const f=workerFixture();try{await f.run();assert.equal(f.sent(),1);assert.equal(f.store.db.prepare('SELECT status FROM jobs').get().status,'sent');
    assert.deepEqual(f.logs,['META_REPLY_CONFIRMED']);}finally{f.close();}
});

test('un error después del envío deja el estado incierto y nunca vuelve a publicar',async()=>{
  const f=workerFixture({confirmationError:new GraphError()});try{
    await f.run();assert.equal(f.sent(),1);assert.equal(f.store.db.prepare('SELECT status FROM jobs').get().status,'uncertain');
    f.store.db.exec('UPDATE jobs SET nextAt=0');await f.run();assert.equal(f.sent(),1);
  }finally{f.close();}
});

test('un envío cuyo resultado no llegó tampoco se duplica',async()=>{
  const f=workerFixture({replyError:new GraphError()});try{
    await f.run();f.store.db.exec('UPDATE jobs SET nextAt=0');await f.run();assert.equal(f.sent(),1);
    assert.equal(f.store.db.prepare('SELECT status FROM jobs').get().status,'uncertain');
  }finally{f.close();}
});

test('una respuesta humana existente de la Página impide el envío',async()=>{
  const f=workerFixture({existing:[{id:'1433778465371696',from:{id:PAGE_ID},parent:{id:job().id},message:'Atención humana'}]});
  try{await f.run();assert.equal(f.sent(),0);assert.equal(f.store.db.prepare('SELECT status FROM jobs').get().status,'skipped');}finally{f.close();}
});

test('Graph no sigue enlaces de paginación arbitrarios ni admite solicitudes de eliminación',async()=>{
  let called=0;
  const g=new Graph({appSecret:'ficticio',pageToken:'TOKEN_FICTICIO'}, {fetchFn:async()=>{called++;return {ok:true,json:async()=>({data:[],paging:{next:'https://ejemplo.invalid/?token=privado'}})};}});
  await assert.rejects(g.replies(job().id),/unknown_replies/);assert.equal(called,1);
  await assert.rejects(g.call('me',{method:'DELETE'}),/invalid_meta_request/);assert.equal(called,1);
});

test('los errores públicos de Graph no incluyen claves, texto ni mensajes originales',async()=>{
  const g=new Graph({appSecret:'CLAVE_FICTICIA',pageToken:'TOKEN_FICTICIO'}, {fetchFn:async()=>({ok:false,status:400,json:async()=>({error:{code:190,message:'TOKEN_FICTICIO y datos privados'}})})});
  try{await g.call('me');assert.fail('debe rechazar');}catch(error){assert.equal(error.code,190);assert.equal(error.message,'meta_request_failed');assert.equal(error.message.includes('TOKEN_FICTICIO'),false);}
});

test('un token de otra app, de usuario o sin permisos nunca vincula la Página',async()=>{
  for(const change of [{app_id:'9999999999'},{type:'USER'},{scopes:[]},{is_valid:false}]){
    const g=new Graph({appSecret:'ficticio',pageToken:'TOKEN_FICTICIO'});
    g.call=async path=>path===APP_ID?{id:APP_ID}:path==='debug_token'?{data:{is_valid:true,app_id:APP_ID,type:'PAGE',scopes:SCOPES,...change}}:{id:PAGE_ID};
    await assert.rejects(g.validate(),/invalid_page_token/);
  }
});

async function httpFixture(){
  const f=fixture(),logs=[];let app;
  const factory=()=>({validate:async()=>({id:PAGE_ID}),checkSubscriptions:async()=>{},configure:async()=>{}});
  app=createApp({store:f.store,origin:'http://127.0.0.1:8080',graphFactory:factory,log:message=>logs.push(message)});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const root='http://127.0.0.1:'+app.server.address().port;
  return {...f,app,root,logs,close:async()=>{app.stop();await new Promise(resolve=>app.server.close(resolve));f.close();}};
}

test('el endpoint rechaza firmas falsas y acepta el desafío exacto sin revelar claves',async()=>{
  const f=await httpFixture();try{
    const bad=await fetch(f.root+'/webhook',{method:'POST',body:JSON.stringify(packet())});assert.equal(bad.status,403);
    const challenge=await fetch(f.root+'/webhook?hub.mode=subscribe&hub.verify_token='+f.app.verifyToken+'&hub.challenge=123456');
    assert.equal(challenge.status,200);assert.equal(await challenge.text(),'123456');
    const health=await (await fetch(f.root+'/health')).json();assert.equal(health.respuestasHabilitadas,false);
    assert.equal(JSON.stringify(health).includes(f.app.verifyToken),false);
  }finally{await f.close();}
});

test('la configuración exige origen propio y consentimiento explícito',async()=>{
  const f=await httpFixture();try{
    const data={appSecret:'a'.repeat(32),pageToken:'TOKEN_FICTICIO_PARA_PRUEBA',enabled:true,consent:true};
    for(const headers of [{'Content-Type':'application/json'}, {'Content-Type':'application/json',Origin:'https://ejemplo.invalid'}])
      assert.equal((await fetch(f.root+'/configurar',{method:'POST',headers,body:JSON.stringify(data)})).status,403);
    const denied=await fetch(f.root+'/configurar',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://127.0.0.1:8080'},body:JSON.stringify({...data,consent:false})});assert.equal(denied.status,400);
    const good=await fetch(f.root+'/configurar',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://127.0.0.1:8080'},body:JSON.stringify(data)});assert.equal(good.status,200);
    assert.equal(f.app.state().ready,true);assert.equal(f.logs.some(line=>line.includes(data.pageToken)),false);
    const publicHtml=await (await fetch(f.root+'/configuracion')).text();assert.equal(publicHtml.includes(data.pageToken),false);
  }finally{await f.close();}
});

test('un origen público inseguro se rechaza y el desarrollo local sí se admite',()=>{
  assert.equal(publicOrigin({PUBLIC_URL:'https://scala.ejemplo.invalid'}),'https://scala.ejemplo.invalid');
  assert.equal(publicOrigin({PORT:'8080'}),'http://127.0.0.1:8080');
  for(const value of ['http://scala.ejemplo.invalid','https://usuario:clave@scala.ejemplo.invalid','https://scala.ejemplo.invalid/?clave=privada'])
    assert.throws(()=>publicOrigin({PUBLIC_URL:value}),/invalid_public_url/);
});
