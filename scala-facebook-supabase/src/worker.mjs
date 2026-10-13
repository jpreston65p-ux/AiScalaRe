import {APP_ID,PAGE_NAME,REPLY,Graph,GraphError,digest,hmac,signatureValid,eventsFrom,processJob} from './meta.mjs';
export const PAGE_ID='1369521966245025';
export const PROJECT_ORIGIN='https://tysbnwvzbtolgydceovl.supabase.co';
export const SLUG='scala-fe-comments';
export const BASE=PROJECT_ORIGIN+'/functions/v1/'+SLUG;
export const VAULT_PREFIX='scala_fb_'+PAGE_ID+'_';
const encoder=new TextEncoder(),fatal=e=>['wrong_page','wrong_app','invalid_page_token','webhook_not_connected','page_not_subscribed'].includes(e.message)||e instanceof GraphError&&[10,190,200].includes(e.code);
function complete(k){return /^[a-f\d]{32}$/i.test(k.app_secret||'')&&/^[\w.|:\-+/=]{20,4096}$/.test(k.page_token||'')&&/^[\w-]{32,256}$/.test(k.verify_token||'')&&/^[a-f\d]{64}$/.test(k.peer_key||'');}
const fingerprint=c=>digest(JSON.stringify([APP_ID,c.page,c.origin,c.appSecret,c.pageToken,c.verifyToken]));
const makeConfig=k=>({page:PAGE_ID,appSecret:k.app_secret,pageToken:k.page_token,verifyToken:k.verify_token,peerSecret:k.peer_key,wakeToken:k.wake_token,origin:BASE,enabled:k.enabled});
/** @param {{store:any,fetchFn?:typeof fetch,now?:()=>number,log?:(message:string)=>void}} options */
export function createService({store,fetchFn=fetch,now=Date.now,log=message=>console.log(message)}){
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
  const text=value=>new Response(value,{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}});
  async function load(){const keys=await store.credentials();return {keys,c:makeConfig(keys)};}
  async function ready(c){return c.enabled&&await store.get('ready')==='1'&&await store.get('credential_digest')===await fingerprint(c);}
  async function run(){
    let c,holder;
    try{
      const loaded=await load();c=loaded.c;if(!complete(loaded.keys)||!c.enabled)return;
      holder=await store.lock();if(!holder)return;
      const graph=new Graph(c,fetchFn),checked=Number(await store.get('checked_at'));
      if(!await ready(c)){
        if(Number(await store.get('retry_at'))>now())return;
        await store.set('ready','0');await graph.connect();
        if(!await store.get('active_since'))await store.set('active_since',Math.floor(now()/1000)*1000);
        await store.set('credential_digest',await fingerprint(c));await store.set('ready','1');await store.set('checked_at',now());
        log('SCALA_META_CONNECTED');
      }else if(!checked||now()-checked>=900000){await graph.validate();await graph.subscriptions();await store.set('checked_at',now());}
      await store.renew(holder);await store.cleanup();const started=now();
      for(let i=0;i<5&&now()-started<80000;i++){
        const job=await store.next();if(!job)break;
        await store.renew(holder);await processJob(job,{c,store,graph,holder,now,log});
      }
    }catch(e){
      try{if(fatal(e)||c&&!await ready(c)){await store.set('ready','0');await store.set('retry_at',now()+300000);}}catch{}
      log('SCALA_RUN_PENDING');
    }finally{if(holder)try{await store.unlock(holder);}catch{}}
  }
  const wake=ctx=>{if(ctx?.waitUntil)ctx.waitUntil(run());};
  async function status(){
    try{
      const {keys,c}=await load(),connected=complete(keys)&&await ready(c),last=Number(await store.get('last_reply'))||null;
      // Recorded by the operator only after observing a confirmed reply to
      // an account outside the app and business roles, on this bound Page.
      const external=/^\d{5,30}(?:_\d{5,30})?$/.test(await store.get('external_verified_reply_id')||'');
      return {proyecto:'SCALA Facebook gratuito',alojamiento:'Supabase Free',pagina:PAGE_NAME,estado:!complete(keys)?'credenciales_meta_pendientes':!c.enabled?'pausado':connected?(external?'activa':'conectada_para_pruebas'):'conexion_meta_pendiente',
        respuestasHabilitadas:connected,respuestaAutonomaVerificada:!!last,ultimaRespuestaConfirmada:last?new Date(last).toISOString():null,publicoGeneralVerificado:external};
    }catch{return {proyecto:'SCALA Facebook gratuito',alojamiento:'Supabase Free',estado:'base_pendiente',respuestasHabilitadas:false,respuestaAutonomaVerificada:false,publicoGeneralVerificado:false};}
  }
  async function fetchRequest(request,ctx){
    const url=new URL(request.url),path=url.pathname.replace(new RegExp('^/(?:functions/v1/)?'+SLUG+'(?=/|$)'),'')||'/';
    let stage='request';
    try{
      if(request.method==='GET'&&(path==='/'||path==='/health')){const s=await status();return path==='/'?text(statusText(s)):json(s);}
      if(request.method==='GET'&&['/privacidad','/eliminacion-datos'].includes(path))return text(privacyText());
      if(['/wake','/recover'].includes(path)&&request.method==='POST'){
        const supplied=request.headers.get('x-scala-wake'),{keys,c}=await load();
        if(!/^[a-f\d]{64}$/.test(supplied||'')||!keys.wake_token||!await signatureValid(encoder.encode('scala-wake'),'sha256='+await hmac(supplied,'scala-wake'),keys.wake_token))return json({error:'no_autorizado'},403);
        if(path==='/recover'){
          if(Number(request.headers.get('content-length'))>1024)return json({error:'solicitud_no_valida'},400);
          const body=await request.json();
          if(!body||Object.keys(body).length!==1||!new RegExp('^'+PAGE_ID+'_\\d{5,30}$').test(body.post||''))return json({error:'solicitud_no_valida'},400);
          if(!complete(keys)||!await ready(c))return json({error:'conexion_pendiente'},503);
          const jobs=await new Graph(c,fetchFn).recover(body.post,{since:Number(await store.get('active_since')),now:now()});
          const queued=await store.enqueue(jobs,{retrySkipped:true});wake(ctx);log('SCALA_COMMENTS_RECOVERED');return json({received:true,queued});
        }
        wake(ctx);return json({received:true});
      }
      if(path!=='/webhook')return json({error:'no_encontrado'},404);
      if(request.method==='GET'){
        const {keys}=await load(),m=url.searchParams.getAll('hub.mode'),t=url.searchParams.getAll('hub.verify_token'),ch=url.searchParams.getAll('hub.challenge');
        if(m.length!==1||t.length!==1||ch.length!==1||m[0]!=='subscribe'||!keys.verify_token||t[0]!==keys.verify_token||!/^\d{1,128}$/.test(ch[0]))return json({error:'verificacion_rechazada'},403);
        return new Response(ch[0],{headers:{'Content-Type':'text/plain','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
      }
      if(request.method!=='POST')return json({error:'metodo_no_permitido'},405);
      const signature=request.headers.get('x-hub-signature-256');if(!/^sha256=[a-f\d]{64}$/.test(signature||''))return json({error:'firma_rechazada'},403);
      if(Number(request.headers.get('content-length'))>262144)return json({error:'aviso_demasiado_grande'},413);
      const reader=request.body?.getReader(),parts=[];let length=0;
      if(!reader)return json({error:'solicitud_no_valida'},400);
      while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>262144){await reader.cancel();return json({error:'aviso_demasiado_grande'},413);}parts.push(value);}
      const body=new Uint8Array(length);let offset=0;for(const part of parts){body.set(part,offset);offset+=part.byteLength;}
      stage='credentials';const {keys,c}=await load();if(!keys.app_secret)return json({error:'credenciales_meta_pendientes'},503);
      if(!await signatureValid(body,signature,keys.app_secret))return json({error:'firma_rechazada'},403);
      stage='json';const payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));
      if(!c.enabled)return json({received:true,paused:true});
      if(!complete(keys)||!await ready(c)){wake(ctx);return json({error:'conexion_pendiente'},503);}
      stage='events';const events=await eventsFrom(payload,{page:PAGE_ID,since:Number(await store.get('active_since')),now:now()});
      stage='enqueue';await store.enqueue(events);stage='metadata';await store.set('last_webhook',now());wake(ctx);log('SCALA_SIGNED_WEBHOOK_RECEIVED');return json({received:true});
    }catch(e){const code=/^[A-Z0-9]{5}$/.test(e?.code||'')?e.code:'UNCLASSIFIED';log('SCALA_WEBHOOK_PENDING_'+stage+'_'+code);return json({error:'solicitud_o_conexion_pendiente'},503);}
  }
  return {fetch:fetchRequest,run,status};
}
function statusText(s){const labels={credenciales_meta_pendientes:'Falta vincular Facebook',pausado:'Respuestas pausadas',conectada_para_pruebas:'Conectada para pruebas',activa:'Activa · respuesta externa verificada',conexion_meta_pendiente:'Conexión con Meta pendiente',base_pendiente:'Base pendiente'};
  return `SCALA · Asistente de comentarios 💙
${PAGE_NAME}

${labels[s.estado]||'Configuración pendiente'}
${s.respuestasHabilitadas?'Las respuestas automáticas están habilitadas.':'Todavía no se envían respuestas automáticas.'}
${s.respuestaAutonomaVerificada?'Se observó una respuesta automática en Facebook.':'La conexión todavía necesita una prueba real en Facebook.'}

El servicio está alojado en la nube. Cuando esté vinculado y activo podrá atender con tu PC apagada, dentro de los límites del plan gratuito.
${s.publicoGeneralVerificado?'Se comprobó una respuesta a una cuenta ajena a los roles de la app y del negocio, en esta Página.':'La atención al público necesita una prueba con una persona ajena a los roles de la app.'}

Privacidad: ${BASE}/privacidad
Eliminación de datos: ${BASE}/eliminacion-datos
`;
}
function privacyText(){return `Privacidad del asistente de SCALA

Este asistente procesa avisos firmados de Meta sobre comentarios públicos de ${PAGE_NAME}. Conserva IDs, fechas, un hash del texto y estados de atención en una base privada de Supabase. No almacena textos ni nombres de clientes. Los registros se eliminan después de 30 días durante el mantenimiento del servicio activo.

Las bajas se conservan con un identificador criptográfico para respetarlas. Las claves de Meta se guardan cifradas en Supabase Vault. No utiliza cookies, sesiones del navegador ni contraseñas de Facebook. No confirma pagos ni entregas.

Para solicitar eliminación o reanudación de atención, contacta al equipo de SCALA por la Página e indica el enlace del comentario. Esta página no registra automáticamente solicitudes. Cuando Meta facilita el identificador del autor, escribir BAJA pausa sus respuestas al procesar el aviso. Si Meta lo omite, no se responde al comentario BAJA y se conserva únicamente una referencia del comentario, sin deducir la identidad de la persona.

SCALA, para una vida edificada.
https://vitacala.online/
`;
}
