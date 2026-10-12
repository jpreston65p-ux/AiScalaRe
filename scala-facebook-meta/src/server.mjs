import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {join} from 'node:path';
import {Store} from './store.mjs';
import {Graph,GraphError} from './graph.mjs';
import {PAGE_ID,APP_ID,signatureValid,commentEvents} from './policy.mjs';
import {processJob} from './worker.mjs';
import {setupHtml,privacyHtml,deletionHtml} from './views.mjs';

process.umask(0o077);
export async function readBody(request,limit=1048576){
  const parts=[];let total=0;
  for await(const part of request){total+=part.length;if(total>limit)throw new Error('body_too_large');parts.push(part);}
  return Buffer.concat(parts);
}
export function publicOrigin(env=process.env){
  const value=env.PUBLIC_URL || (env.RAILWAY_PUBLIC_DOMAIN?'https://'+env.RAILWAY_PUBLIC_DOMAIN:'http://127.0.0.1:'+Number(env.PORT || 8080));
  const url=new URL(value);
  if(url.username || url.password || url.search || url.hash || !['https:','http:'].includes(url.protocol)
    || url.protocol==='http:' && !['127.0.0.1','localhost'].includes(url.hostname))throw new Error('invalid_public_url');
  return url.origin;
}
export function createApp({store,origin,graphFactory=config=>new Graph(config),log=message=>console.log(message)}={}){
  let config=store.config(),graph=config?graphFactory(config):null,ready=false,configuring=false,busy=false,closing=false,lastReply=null;
  let setupWindow=Date.now(),setupAttempts=0;
  let state=config?'comprobando_meta':'pendiente_de_credenciales';
  const verifyToken=store.get('verify_token') || randomBytes(32).toString('hex');store.set('verify_token',verifyToken);
  const json=(response,status,data)=>{response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});response.end(JSON.stringify(data));};
  const html=(response,body)=>{
    response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"});response.end(body);
  };
  const activate=async()=>{
    ready=false;
    if(!config)return;
    await graph.validate();await graph.checkSubscriptions(origin);
    ready=config.enabled===true;
    state=ready?'conectada_para_pruebas':'conectada_sin_respuestas';
    if(ready && !store.get('active_since'))store.set('active_since',Math.floor(Date.now()/1000)*1000);
    log('SCALA_META_CONNECTED: Página Scala Fe y suscripción feed comprobadas.');
  };
  const server=createServer(async(request,response)=>{
    try{
      const url=new URL(request.url,'http://localhost');
      if(request.method==='GET' && url.pathname==='/health')return json(response,200,{proyecto:'SCALA Comentarios Meta',estado:state,
        respuestasHabilitadas:ready,respuestaAutonomaVerificada:lastReply!==null});
      if(request.method==='GET' && ['/','/configuracion'].includes(url.pathname))return html(response,setupHtml());
      if(request.method==='GET' && url.pathname==='/privacidad')return html(response,privacyHtml());
      if(request.method==='GET' && url.pathname==='/eliminacion-datos')return html(response,deletionHtml());
      if(request.method==='GET' && url.pathname==='/webhook'){
        const mode=url.searchParams.getAll('hub.mode'),token=url.searchParams.getAll('hub.verify_token'),challenge=url.searchParams.getAll('hub.challenge');
        if(mode.length!==1 || token.length!==1 || challenge.length!==1 || mode[0]!=='subscribe' || token[0]!==verifyToken || !/^\d{1,128}$/.test(challenge[0]))return json(response,403,{error:'verificacion_rechazada'});
        response.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'no-store'});response.end(challenge[0]);return;
      }
      if(request.method==='POST' && url.pathname==='/webhook'){
        const body=await readBody(request);
        if(!config || !signatureValid(body,request.headers['x-hub-signature-256'],config.appSecret))return json(response,403,{error:'firma_rechazada'});
        const payload=JSON.parse(body.toString('utf8'));
        const since=Number(store.get('active_since'));
        if(ready)store.enqueue(commentEvents(payload,{since}));
        log('SCALA_META_WEBHOOK_RECEIVED: Aviso firmado recibido.');
        return json(response,200,{received:true});
      }
      if(request.method==='POST' && url.pathname==='/configurar'){
        if(request.headers.origin!==origin || !/^application\/json(?:;|$)/i.test(request.headers['content-type'] || ''))return json(response,403,{error:'origen_rechazado'});
        if(configuring)return json(response,409,{error:'configuracion_en_proceso'});
        const input=JSON.parse((await readBody(request,16384)).toString('utf8'));
        if(typeof input.appSecret!=='string' || !/^[a-f0-9]{32}$/i.test(input.appSecret)
          || typeof input.pageToken!=='string' || !/^[a-zA-Z0-9._|:\-+/=]{20,4096}$/.test(input.pageToken)
          || input.consent!==true || input.enabled!==true)return json(response,400,{error:'datos_o_autorizacion_incompletos'});
        if(Date.now()-setupWindow>3600000){setupWindow=Date.now();setupAttempts=0;}
        if(++setupAttempts>10)return json(response,429,{error:'demasiados_intentos'});
        configuring=true;
        let validated=false;
        try{
          const candidate={appSecret:input.appSecret,pageToken:input.pageToken,enabled:true},nextGraph=graphFactory(candidate);
          await nextGraph.validate();
          validated=true;
          await nextGraph.configure(origin,verifyToken);
          // The GET challenge uses the private verify token, so a failed
          // credential attempt never overwrites the working connection.
          store.saveConfig(candidate);config=candidate;graph=nextGraph;
          await activate();
          return json(response,200,{ok:true,page:'Scala Fe',state,callback:origin+'/webhook'});
        }catch(error){
          if(validated && !config){ready=false;state='conexion_meta_pendiente';}
          log('SCALA_META_CONFIGURATION_FAILED: '+JSON.stringify({code:error instanceof GraphError?error.code:0}));
          return json(response,400,{error:'meta_no_confirmo_la_conexion',code:error instanceof GraphError?error.code:0});
        }finally{configuring=false;}
      }
      return json(response,404,{error:'no_encontrado'});
    }catch(error){return json(response,error.message==='body_too_large'?413:400,{error:'solicitud_no_valida'});}
  });
  const tick=async()=>{
    if(busy || closing)return;
    store.cleanup();
    if(!ready || configuring)return;
    busy=true;
    try{
      const job=store.next();if(job)await processJob(job,{store,graph,since:Number(store.get('active_since')),log:event=>{
        log('SCALA_'+event);
        if(event==='META_REPLY_CONFIRMED')lastReply=Date.now();
      }});
    }catch{ready=false;state='conexion_meta_pendiente';log('SCALA_META_CONNECTION_REQUIRED: Revisa los permisos o la vigencia de la conexión.');}
    finally{busy=false;}
  };
  const boot=async()=>{if(!config){log('SCALA_META_WAITING_CONFIGURATION: Servidor listo. Falta vincular Meta.');return;}try{await activate();}catch{state='conexion_meta_pendiente';log('SCALA_META_CONNECTION_REQUIRED: Credenciales o suscripciones pendientes.');}};
  return {server,boot,tick,stop:()=>{closing=true;},state:()=>({ready,state,lastReply}),verifyToken};
}

if(import.meta.url===new URL(process.argv[1],'file:').href){
  const store=new Store(join(process.env.SCALA_FACEBOOK_DATA_DIR || './data','meta'));
  const app=createApp({store,origin:publicOrigin()});
  await new Promise(resolve=>app.server.listen(Number(process.env.PORT || 8080),'0.0.0.0',resolve));
  await app.boot();
  const timer=setInterval(()=>void app.tick(),2000);timer.unref();
  let stopping=false;
  const stop=()=>{if(stopping)return;stopping=true;clearInterval(timer);app.stop();app.server.close(()=>{store.close();process.exit(0);});};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
