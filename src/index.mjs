import makeWASocket, { Browsers, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { randomUUID } from 'node:crypto';
import { Store } from './store.mjs';
import { sqliteAuth } from './auth.mjs';
import { loadConfig } from './config.mjs';
import { MessageHandler, normalizePeer } from './handler.mjs';
import { reconnectPolicy } from './lifecycle.mjs';
import { hasLinkedCredentials } from './session.mjs';

// Some upstream crypto modules use console directly. Do not put credentials,
// session keys, customer messages or phone numbers in logs.
for(const method of ['log','info','warn','error','debug']) console[method] = ()=>{};
process.umask(0o077);
const write = text => process.stdout.write(text+'\n');
const log = event => write(`[${new Date().toISOString()}] ${event}`);
const args = new Set(process.argv.slice(2));
const allowed = ['--vincular','--solo-vincular','--servicio','--revincular','--help'];
if([...args].some(a=>!allowed.includes(a))) { write('Opción desconocida. Usa --help.'); process.exit(2); }
if(args.has('--help')) {
  write('SCALA WhatsApp QR\n--vincular: bot en primer plano, con QR si hace falta.\n--solo-vincular: vincular y salir, sin responder a clientes.\n--servicio: ejecución continua con sesión guardada, sin imprimir QR.\n--revincular: descartar la sesión local y vincular otra vez.');
  process.exit(0);
}
if(Number(process.versions.node.split('.')[0])!==24) { write('Este proyecto requiere Node.js 24. Ejecuta PREPARAR_SCALA_MINT.sh.'); process.exit(2); }
if(args.has('--servicio') && args.has('--revincular')) { write('Para revincular, detén el servicio y usa INICIAR_SCALA_WHATSAPP.sh --solo-vincular --revincular.'); process.exit(2); }

let store, socket, timer, heartbeat, maintenance, handler, closing=false, attempts=0, generation=0;
const owner = randomUUID(), service=args.has('--servicio'), pairOnly=args.has('--solo-vincular');
const logger = pino({level:'silent'});
async function stop(code=0) {
  if(closing) return;
  closing=true; clearTimeout(timer); clearInterval(heartbeat); clearInterval(maintenance); generation++;
  if(socket) { socket.ev.removeAllListeners('connection.update'); socket.ev.removeAllListeners('messages.upsert'); }
  let drainTimer;
  await Promise.race([handler?.drain() || Promise.resolve(),new Promise(resolve=>{drainTimer=setTimeout(resolve,10000);})]);
  clearTimeout(drainTimer);
  try { socket?.end(new Error('SCALA_STOP')); } catch {}
  try { store?.releaseRunner(owner); store?.close(); } catch {}
  process.exit(code);
}
process.once('SIGINT',()=>stop(0)); process.once('SIGTERM',()=>stop(0));
process.on('unhandledRejection',()=>{ log('error_interno'); void stop(1); });
process.on('uncaughtException',()=>{ log('error_interno'); void stop(1); });

try {
  const config=loadConfig();
  store=new Store(config.dataDir);
  store.acquireRunner(owner);
  heartbeat=setInterval(()=>{try {store.renewRunner(owner);} catch {log('otro_proceso_detectado');void stop(1);}},5000);
  heartbeat.unref();
  if(args.has('--revincular')) store.clearAuth();
  if(store.meta('auth_invalid')==='1') {
    write('La sesión necesita una nueva vinculación. Detén el servicio y ejecuta INICIAR_SCALA_WHATSAPP.sh --solo-vincular --revincular.');
    await stop(78);
  }
  const auth=sqliteAuth(store);
  if(service && !hasLinkedCredentials(auth.state.creds)) { write('Falta vincular por QR. Ejecuta INICIAR_SCALA_WHATSAPP.sh --solo-vincular.'); await stop(78); }
  store.cleanup();
  maintenance=setInterval(()=>{try {store.cleanup();} catch {log('error_limpieza');}},3600000);
  maintenance.unref();
  handler=new MessageHandler({
    ...config, store, log,
    async resolvePeers(message) {
      const remote=normalizePeer(message.key?.remoteJid);
      const mapping=socket?.signalRepository?.lidMapping;
      if(!remote || !mapping) return [];
      try {
        const alternate=remote.endsWith('@lid') ? await mapping.getPNForLID(remote) : await mapping.getLIDForPN(remote);
        return alternate ? [alternate] : [];
      } catch { return []; }
    },
    async send(jid,text,messageId) {
      if(!socket || socket.ws?.isClosed) throw new Error('not_connected');
      const active=socket;
      let timeout;
      try {
        const result=await Promise.race([
          active.sendMessage(jid,{text,linkPreview:null},{messageId}),
          new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('send_timeout')),20000);}),
        ]);
        if(!result?.key?.id) throw new Error('send_unconfirmed');
      } finally { clearTimeout(timeout); }
    },
  });
  function connect() {
    if(closing) return;
    const current=++generation;
    socket=makeWASocket({
      auth:{creds:auth.state.creds,keys:makeCacheableSignalKeyStore(auth.state.keys,logger)},
      logger, browser:Browsers.ubuntu('Chrome'),
      markOnlineOnConnect:false, syncFullHistory:false,
      shouldSyncHistoryMessage:()=>false, emitOwnEvents:true,
      connectTimeoutMs:60000, defaultQueryTimeoutMs:15000,
      getMessage:async key=>{
        const text=key.id ? store.outgoingText(key.id) : null;
        return text ? {conversation:text} : undefined;
      },
      shouldIgnoreJid:jid=>jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@newsletter'),
    });
    const active=socket;
    active.ev.on('creds.update',update=>{
      if(closing || current!==generation) return;
      Object.assign(auth.state.creds,update); auth.saveCreds();
    });
    active.ev.on('messages.upsert',batch=>{
      if(closing || pairOnly || current!==generation) return;
      void handler.handleBatch(batch).catch(()=>log('error_procesando'));
    });
    active.ev.on('connection.update',({connection,lastDisconnect,qr})=>{
      if(closing || current!==generation) return;
      if(qr) {
        if(service) { store.setMeta('auth_invalid','1'); write('La sesión requiere QR. Detén el servicio y vuelve a vincular.'); void stop(78); return; }
        if(!process.stdout.isTTY) { write('El QR solo se muestra en una terminal privada. Usa una terminal normal o SSH con -t.'); void stop(78); return; }
        write('\nEn WhatsApp Business: menú ⋮ → Dispositivos vinculados → Vincular un dispositivo.');
        qrcode.generate(qr,{small:true},code=>write(code));
        write('Escanea este QR con tu celular. No lo compartas.');
      }
      if(connection==='open') {
        attempts=0; auth.saveCreds(); store.setMeta('auth_invalid','0'); store.setMeta('last_connected_at',Date.now());
        log('whatsapp_conectado');
        if(pairOnly) { write('Sesión guardada. Ahora puedes instalar el servicio.'); timer=setTimeout(()=>stop(0),1500); }
        else write('SCALA está atendiendo mensajes nuevos. Ctrl+C detiene este proceso.');
      }
      if(connection==='close') {
        const status=lastDisconnect?.error?.output?.statusCode;
        const policy=reconnectPolicy(status,attempts++);
        active.ev.removeAllListeners('connection.update'); active.ev.removeAllListeners('messages.upsert');
        if(!policy.retry) {
          store.setMeta('auth_invalid','1');
          write('WhatsApp cerró o reemplazó la sesión. Revisa Dispositivos vinculados y vuelve a vincular.');
          void stop(78);
        } else { log('reconectando'); clearTimeout(timer); timer=setTimeout(connect,policy.delay); }
      }
    });
  }
  write(pairOnly ? 'SCALA · Vinculación por QR (no responde a clientes en este modo).' : 'SCALA · Bot de atención por catálogo.');
  connect();
} catch(error) {
  const messages={already_running:'Ya hay un bot usando esta sesión. Detén el otro proceso o espera 30 segundos tras un cierre inesperado.',invalid_catalog:'Revisa catalogo.json: el catálogo no es válido.',invalid_limit:'SCALA_DAILY_LIMIT no es válido.'};
  write(messages[error?.message] || 'No se pudo iniciar SCALA. Comprueba permisos, dependencias y catalogo.json con DIAGNOSTICO_SCALA.sh.');
  await stop(1);
}
