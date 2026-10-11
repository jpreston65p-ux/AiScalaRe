import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Store } from '../src/store.mjs';
import { MessageHandler, readText, normalizePeer } from '../src/handler.mjs';
import { sqliteAuth } from '../src/auth.mjs';
import { catalogFor, defaultCatalog } from '../src/catalog.mjs';
import { reconnectPolicy } from '../src/lifecycle.mjs';
import { hasLinkedCredentials } from '../src/session.mjs';

function fixture(t,extra={}) {
  const dir=mkdtempSync(join(tmpdir(),'scala-qr-test-'));
  let clock=Date.now(),counter=0;
  const now=()=>clock,store=new Store(dir,now),sent=[],logs=[];
  const handler=new MessageHandler({store,catalog:catalogFor(),now,send:async(jid,text,id)=>{sent.push({jid,text,id});},log:event=>logs.push(event),...extra});
  t.after(()=>{try {store.close();} catch {} rmSync(dir,{recursive:true,force:true});});
  const message=(text,options={})=>({key:{remoteJid:options.jid || '101@s.whatsapp.net',id:options.id || `fixture-${++counter}`,fromMe:!!options.fromMe,...options.key},messageTimestamp:Math.floor((options.time ?? clock)/1000),message:options.content || {conversation:text}});
  const emit=async(text,options={})=>handler.handleBatch({type:options.type || 'notify',messages:[message(text,options)]});
  return {dir,store,handler,sent,logs,now,message,emit,advance:ms=>{clock+=ms;}};
}

test('un cliente recorre el menú, catálogo y ficha mediante opciones numéricas',async t=>{
  const f=fixture(t);
  await f.emit('hola'); assert.match(f.sent.at(-1).text,/1\. Ver productos/);
  await f.emit('1'); assert.match(f.sent.at(-1).text,/Gedeón/);
  await f.emit('1'); assert.match(f.sent.at(-1).text,/Cuento digital PDF/);
  assert.match(f.sent.at(-1).text,/Precio.*confirmar/);
  assert.equal(f.store.contact(f.store.resolvePeer(['101@s.whatsapp.net'])).product_id,'gedeon');
});

test('precio pendiente permite seguir consultando y solo la solicitud humana pausa el bot',async t=>{
  const f=fixture(t);
  await f.emit('Gedeón'); await f.emit('cuánto cuesta');
  assert.match(f.sent.at(-1).text,/confirmar el precio actual/);
  await f.emit('quiero más información'); assert.match(f.sent.at(-1).text,/Jueces 6 y 7/);
  await f.emit('hablar con una persona');
  const total=f.sent.length; await f.emit('pdf'); assert.equal(f.sent.length,total);
  await f.emit('MENÚ'); assert.equal(f.sent.length,total+1);
  await f.emit('pdf'); assert.match(f.sent.at(-1).text,/archivo digital/);
});

test('la baja y la deduplicación sobreviven a reiniciar el proceso',async t=>{
  const f=fixture(t);
  await f.emit('BAJA',{id:'stop-fixture'});
  f.store.close();
  const restarted=new Store(f.dir,f.now); t.after(()=>restarted.close());
  let sends=0;
  const handler=new MessageHandler({store:restarted,catalog:catalogFor(),now:f.now,send:async()=>{sends++;}});
  await handler.handleBatch({type:'notify',messages:[f.message('BAJA',{id:'stop-fixture'}),f.message('hola')]});
  assert.equal(sends,0);
  await handler.handleBatch({type:'notify',messages:[f.message('MENÚ')]}); assert.equal(sends,1);
});

test('una respuesta manual pausa el bot y sus propios ecos no lo pausan',async t=>{
  const f=fixture(t);
  await f.emit('hola');
  await f.emit(f.sent[0].text,{fromMe:true,id:f.sent[0].id});
  await f.emit('pdf'); assert.equal(f.sent.length,2);
  await f.emit('Te atiendo personalmente',{fromMe:true,id:'human-fixture'});
  await f.emit('pdf'); assert.equal(f.sent.length,2);
  await f.emit('MENÚ'); assert.equal(f.sent.length,3);
});

test('ecos manuales antiguos no deshacen una reactivación posterior',async t=>{
  const f=fixture(t),old=f.now();
  await f.emit('hola'); f.advance(3000); await f.emit('MENÚ');
  await f.emit('eco retrasado',{fromMe:true,id:'late-human',time:old});
  await f.emit('pdf'); assert.equal(f.sent.length,3);
});

test('se ignoran historial, grupos, estados, canales, reacciones y mensajes antiguos',async t=>{
  const f=fixture(t);
  await f.emit('hola',{type:'append'});
  for(const jid of ['123@g.us','status@broadcast','123@newsletter']) await f.emit('hola',{jid});
  await f.emit('hola',{time:f.now()-360000});
  await f.emit('hola',{time:f.now()+120000});
  await f.emit('',{content:{reactionMessage:{text:'👍'}}});
  assert.equal(f.sent.length,0);
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM events').get().n,0);
});

test('los archivos y audios piden atención humana sin leer su contenido',async t=>{
  const f=fixture(t);
  await f.emit('',{content:{audioMessage:{url:'https://invalid.example/private-audio'}}});
  assert.match(f.sent.at(-1).text,/archivo o audio/);
  assert.doesNotMatch(f.sent.at(-1).text,/private-audio/);
  assert.equal(readText({message:{ephemeralMessage:{message:{conversation:'pdf'}}}}),'pdf');
  assert.equal(readText({message:{conversation:'x'.repeat(9000)}}).length,2000);
});

test('notificaciones concurrentes duplicadas generan una sola respuesta',async t=>{
  const f=fixture(t);
  await Promise.all([f.emit('hola',{id:'same-event'}),f.emit('hola',{id:'same-event'}),f.emit('hola',{id:'same-event'})]);
  assert.equal(f.sent.length,1);
  assert.equal(f.store.eventState('in','same-event'),'sent');
});

test('un resultado de red incierto nunca provoca un reenvío al repetirse el evento',async t=>{
  let attempts=0;
  const f=fixture(t,{send:async()=>{attempts++; throw new Error('private-error-not-for-logs');}});
  await f.emit('hola',{id:'network-fixture'}); await f.emit('hola',{id:'network-fixture'});
  assert.equal(attempts,1); assert.equal(f.store.eventState('in','network-fixture'),'uncertain');
  assert.deepEqual(f.logs,['envio_sin_confirmar']);
});

test('las respuestas del catálogo están disponibles para el reintento del protocolo y caducan en 24 horas',async t=>{
  const f=fixture(t); await f.emit('hola');
  const outgoing=f.sent[0];
  assert.equal(f.store.outgoingText(outgoing.id),outgoing.text);
  f.advance(86400001); assert.equal(f.store.outgoingText(outgoing.id),undefined);
  f.store.cleanup(); assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM outbound').get().n,0);
});

test('PN y LID comparten preferencias y bajas cuando WhatsApp entrega la equivalencia',async t=>{
  const f=fixture(t);
  await f.emit('BAJA',{jid:'777@lid'});
  await f.emit('hola',{jid:'101@s.whatsapp.net',key:{remoteJidAlt:'777@lid'}});
  assert.equal(f.sent.length,1);
  await f.emit('MENÚ',{jid:'101@s.whatsapp.net',key:{remoteJidAlt:'777@lid'}});
  await f.emit('pdf',{jid:'777@lid'}); assert.equal(f.sent.length,3);
  assert.equal(normalizePeer('101:9@s.whatsapp.net'),'101@s.whatsapp.net');
});

test('al combinar dos identidades existentes se conserva la pausa humana',async t=>{
  const f=fixture(t);
  await f.emit('hola',{jid:'777@lid'});
  await f.emit('hola',{jid:'101@s.whatsapp.net'});
  f.advance(2000);
  await f.emit('Te ayudo yo',{fromMe:true,jid:'777@lid'});
  await f.emit('hola',{jid:'101@s.whatsapp.net',key:{remoteJidAlt:'777@lid'}});
  assert.equal(f.sent.length,2);
});

test('un mensaje fuera de orden no revierte una decisión más reciente',async t=>{
  const f=fixture(t),old=f.now();
  f.advance(5000); await f.emit('BAJA');
  await f.emit('MENÚ',{time:old}); await f.emit('hola'); assert.equal(f.sent.length,1);
});

test('los límites por chat y global impiden responder por encima de la cuota',async t=>{
  const f=fixture(t);
  for(let i=0;i<11;i++) await f.emit('hola'); assert.equal(f.sent.length,10);
  f.advance(61000); await f.emit('hola'); assert.equal(f.sent.length,11);
  const g=fixture(t,{dailyLimit:2});
  for(const jid of ['201@s.whatsapp.net','202@s.whatsapp.net','203@s.whatsapp.net']) await g.emit('hola',{jid});
  assert.equal(g.sent.length,2);
});

test('credenciales, claves Signal y claves LID conservan buffers tras reiniciar',async t=>{
  const f=fixture(t),auth=sqliteAuth(f.store);
  auth.state.creds.me={id:'100:1@s.whatsapp.net',name:'QR fixture'};
  assert.equal(auth.state.creds.registered,false);
  auth.saveCreds();
  await auth.state.keys.set({session:{fixture:{key:Buffer.from([1,2,3])}},'lid-mapping':{fixture:'777@lid'},'app-state-sync-key':{fixture:{keyData:Buffer.from([4,5])}}});
  f.store.close(); const reopened=new Store(f.dir,f.now); t.after(()=>reopened.close());
  const recovered=sqliteAuth(reopened);
  assert.equal(recovered.state.creds.registered,false);
  assert.equal(hasLinkedCredentials(recovered.state.creds),true);
  assert.ok(Buffer.isBuffer(recovered.state.creds.noiseKey.private));
  assert.deepEqual((await recovered.state.keys.get('session',['fixture'])).fixture.key,Buffer.from([1,2,3]));
  assert.equal((await recovered.state.keys.get('lid-mapping',['fixture'])).fixture,'777@lid');
  assert.deepEqual(Buffer.from((await recovered.state.keys.get('app-state-sync-key',['fixture'])).fixture.keyData),Buffer.from([4,5]));
  await recovered.state.keys.set({session:{fixture:null}}); assert.deepEqual(await recovered.state.keys.get('session',['fixture']),{});
});

test('los datos de lógica no guardan el texto ni direcciones del cliente y la base es privada',async t=>{
  const f=fixture(t); await f.emit('consulta-personal-ficticia');
  for(const table of ['contacts','aliases','events','quotas']) {
    const rows=JSON.stringify(f.store.db.prepare(`SELECT * FROM ${table}`).all());
    assert.doesNotMatch(rows,/consulta-personal-ficticia|101@s\.whatsapp\.net/);
  }
  assert.equal(statSync(join(f.dir,'scala.sqlite')).mode & 0o077,0);
  assert.equal(statSync(f.dir).mode & 0o077,0);
});

test('un segundo proceso no puede usar la misma sesión y el bloqueo caduca después de un fallo',t=>{
  const f=fixture(t),second=new Store(f.dir,f.now); t.after(()=>second.close());
  f.store.acquireRunner('first'); assert.throws(()=>second.acquireRunner('second'),/already_running/);
  f.advance(31000); second.acquireRunner('second'); assert.throws(()=>f.store.renewRunner('first'),/runner_lost/);
  second.releaseRunner('second'); f.store.acquireRunner('first');
});

test('la limpieza mantiene las bajas y elimina eventos vencidos',async t=>{
  const f=fixture(t); await f.emit('BAJA');
  f.advance(31*86400000); f.store.cleanup();
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM events').get().n,0);
  assert.equal(f.store.contact(f.store.resolvePeer(['101@s.whatsapp.net'])).stopped,true);
});

test('la reconexión se detiene para sesiones cerradas y usa espera creciente en fallos recuperables',()=>{
  for(const code of [401,403,411,440,500]) assert.equal(reconnectPolicy(code,0).retry,false);
  assert.equal(reconnectPolicy(515,4).delay,1000);
  assert.equal(reconnectPolicy(408,6).delay,60000);
});

test('catálogo rechazado para precios inválidos y enlaces que puedan ejecutar contenido',()=>{
  for(const price of [{amount:-1,currency:'BOB'},{amount:20,currency:'invalid'}]) assert.throws(()=>catalogFor({WHATSAPP_CATALOG_JSON:JSON.stringify({...defaultCatalog,products:[{...defaultCatalog.products[0],price}]})}),/invalid_catalog/);
  assert.throws(()=>catalogFor({WHATSAPP_CATALOG_JSON:JSON.stringify({...defaultCatalog,website:'javascript:alert(1)'})}),/invalid_catalog/);
});

test('el servicio sin sesión se detiene sin intentar vincular ni mostrar un QR',t=>{
  const f=fixture(t);
  const r=spawnSync(process.execPath,['src/index.mjs','--servicio'],{cwd:new URL('../',import.meta.url),env:{...process.env,SCALA_DATA_DIR:f.dir},encoding:'utf8',timeout:10000});
  assert.equal(r.status,78,r.stderr); assert.match(r.stdout,/Falta vincular por QR/);
  assert.doesNotMatch(r.stdout,/Escanea este QR|BEGIN PRIVATE/);
});

test('el instalador acepta credenciales QR guardadas aunque registered siga siendo false',t=>{
  const f=fixture(t),auth=sqliteAuth(f.store);
  auth.state.creds.me={id:'100:1@s.whatsapp.net',name:'QR fixture'};
  auth.saveCreds();
  const diagnose=()=>spawnSync(process.execPath,['scripts/diagnostico.mjs','--require-linked'],{cwd:new URL('../',import.meta.url),env:{...process.env,SCALA_DATA_DIR:f.dir},encoding:'utf8',timeout:10000});
  const linked=diagnose(); assert.equal(linked.status,0,linked.stderr);
  const report=JSON.parse(linked.stdout); assert.equal(report.sesionGuardada,true); assert.equal(report.necesitaQr,false);
  f.store.setMeta('auth_invalid','1');
  const invalid=diagnose(); assert.equal(invalid.status,78,invalid.stderr);
  assert.equal(JSON.parse(invalid.stdout).necesitaQr,true);
});

test('la carga por SSH rechaza argumentos de comandos y el paquete declara una sesión persistente',()=>{
  const r=spawnSync('bash',['SUBIR_A_NUBE.sh','--bad-host'],{cwd:new URL('../',import.meta.url),encoding:'utf8',timeout:3000});
  assert.equal(r.status,2); assert.match(r.stdout,/dirección SSH válida/);
  assert.match(readFileSync(new URL('../compose.yaml',import.meta.url),'utf8'),/scala_session:\/app\/data/);
});
