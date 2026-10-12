// SCALA: official Page webhooks on Cloudflare Workers Free + D1.
// No browser sessions, files, payment claims or customer message storage.
export const APP_ID='1175553238884267';
export const PAGE_NAME='Scala Fe - SCALA';
export const GRAPH_VERSION='v26.0';
export const REPLY='¡Hola! 😊 Soy el asistente virtual de SCALA.\n\nSi quieres saber más sobre el producto, escríbenos por WhatsApp 💙.';
export const SCOPES=['pages_manage_engagement','pages_manage_metadata','pages_read_engagement','pages_read_user_content'];
const EXCLUDED_PAGES=new Set(['61576458508649','1121299691061284']);
const DAY=86400000, encoder=new TextEncoder();
const id=value=>typeof value==='string'&&/^\d{5,30}(?:_\d{5,30})?$/.test(value);
const hex=bytes=>[...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
export async function digest(value){return hex(await crypto.subtle.digest('SHA-256',encoder.encode(String(value))));}
export async function hmac(secret,value){
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  return hex(await crypto.subtle.sign('HMAC',key,typeof value==='string'?encoder.encode(value):value));
}
export async function signatureValid(body,signature,secret){
  if(typeof secret!=='string'||!secret||typeof signature!=='string'||!/^sha256=[a-f0-9]{64}$/.test(signature))return false;
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const bytes=Uint8Array.from(signature.slice(7).match(/../g),pair=>parseInt(pair,16));
  return crypto.subtle.verify('HMAC',key,bytes,body);
}
export function config(env){
  const page=env.SCALA_PAGE_ID;
  if(typeof page!=='string'||!/^\d{5,30}$/.test(page)||EXCLUDED_PAGES.has(page))throw new Error('pagina_nueva_pendiente');
  if(typeof env.META_APP_SECRET!=='string'||!/^[a-f0-9]{32}$/i.test(env.META_APP_SECRET)
    ||typeof env.META_PAGE_TOKEN!=='string'||!/^[a-zA-Z0-9._|:\-+/=]{20,4096}$/.test(env.META_PAGE_TOKEN)
    ||typeof env.META_VERIFY_TOKEN!=='string'||!/^[a-zA-Z0-9_-]{32,256}$/.test(env.META_VERIFY_TOKEN))throw new Error('credenciales_pendientes');
  const origin=new URL(env.SCALA_PUBLIC_ORIGIN || '');
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/')throw new Error('origen_publico_pendiente');
  if(!env.DB?.prepare||!env.DB?.batch)throw new Error('base_pendiente');
  return {page,appSecret:env.META_APP_SECRET,pageToken:env.META_PAGE_TOKEN,verifyToken:env.META_VERIFY_TOKEN,
    origin:origin.origin,enabled:env.SCALA_ENABLE==='1'};
}
export async function eventsFrom(payload,{page,since,now=Date.now()}={}){
  if(payload?.object!=='page'||!Array.isArray(payload.entry)||payload.entry.length>100||!Number.isFinite(since))return [];
  const result=[];
  for(const entry of payload.entry){
    if(entry?.id!==page||!Array.isArray(entry.changes)||entry.changes.length>100)continue;
    for(const change of entry.changes){
      const v=change?.value,at=Number(v?.created_time)*1000;
      if(change?.field!=='feed'||v?.item!=='comment'||v.verb!=='add'||!id(v.comment_id)||!id(v.post_id)
        ||v.parent_id!=null&&v.parent_id!==v.post_id||!/^\d{5,30}$/.test(v.from?.id||'')||v.from.id===page
        ||typeof v.message!=='string'||!v.message.trim()||v.message.length>30000||!Number.isFinite(at)
        ||at<since||at>now+60000||now-at>DAY)continue;
      result.push({id:v.comment_id,post:v.post_id,at,author:v.from.id,textHash:await digest(v.message)});
    }
  }
  return result;
}
export async function authorize(job,post,comment,{page,since,now=Date.now()}){
  if(post?.id!==job.post||post.from?.id!==page||comment?.id!==job.id||comment.parent
    ||comment.from?.id!==job.author||comment.from.id===page||comment.is_hidden||comment.is_private
    ||typeof comment.message!=='string'||!comment.message.trim()||await digest(comment.message)!==job.text_hash)return false;
  const at=Date.parse(comment.created_time);
  return Number.isFinite(at)&&Number.isFinite(since)&&at>=since&&at<=now+60000&&now-at<=DAY;
}
export function confirmed(reply,replyId,parentId,page){
  return id(replyId)&&reply?.id===replyId&&reply.parent?.id===parentId&&reply.from?.id===page&&reply.message===REPLY;
}
export class GraphError extends Error{
  constructor(code=0,status=0){super('meta_request_failed');this.code=Number(code)||0;this.status=Number(status)||0;}
}
export class Graph{
  constructor(c,fetchFn=fetch){this.c=c;this.fetchFn=fetchFn;}
  async call(path,{method='GET',params={},app=false}={}){
    if(!/^(?:me|debug_token|\d{5,30}(?:_\d{5,30})?)(?:\/(?:comments|subscribed_apps|subscriptions))?$/.test(path)
      ||!['GET','POST'].includes(method)||method==='POST'&&!/\/(comments|subscribed_apps|subscriptions)$/.test(path))throw new Error('invalid_meta_request');
    const token=app?APP_ID+'|'+this.c.appSecret:this.c.pageToken;
    const data=new URLSearchParams({...params,appsecret_proof:await hmac(this.c.appSecret,token)});
    const url=new URL('https://graph.facebook.com/'+GRAPH_VERSION+'/'+path);
    const options={method,redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+token}};
    if(method==='GET')url.search=data.toString();else{options.headers['Content-Type']='application/x-www-form-urlencoded';options.body=data;}
    let response,body;
    try{response=await this.fetchFn(url,options);body=await response.json();}catch{throw new GraphError();}
    if(!response.ok||body?.error)throw new GraphError(body?.error?.code,response.status);
    return body;
  }
  async validate(){
    const app=await this.call(APP_ID,{app:true,params:{fields:'id,name'}});
    if(app.id!==APP_ID)throw new Error('wrong_app');
    const {data:d}=await this.call('debug_token',{app:true,params:{input_token:this.c.pageToken}});
    if(!d?.is_valid||d.app_id!==APP_ID||d.type!=='PAGE'||!SCOPES.every(scope=>d.scopes?.includes(scope))
      ||Number(d.expires_at)>0&&Number(d.expires_at)*1000<Date.now())throw new Error('invalid_page_token');
    for(const scope of d.granular_scopes||[])if(SCOPES.includes(scope.scope)&&Array.isArray(scope.target_ids)&&!scope.target_ids.includes(this.c.page))throw new Error('wrong_page');
    const page=await this.call('me',{params:{fields:'id,name'}});
    if(page.id!==this.c.page||page.name?.trim()!==PAGE_NAME)throw new Error('wrong_page');
    return page;
  }
  async connect(){
    await this.validate();
    await this.call(APP_ID+'/subscriptions',{method:'POST',app:true,params:{object:'page',fields:'feed',callback_url:this.c.origin+'/webhook',verify_token:this.c.verifyToken}});
    await this.call(this.c.page+'/subscribed_apps',{method:'POST',params:{subscribed_fields:'feed'}});
    await this.subscriptions();
  }
  async subscriptions(){
    const app=await this.call(APP_ID+'/subscriptions',{app:true});
    if(!app.data?.some(item=>item.object==='page'&&item.active===true&&item.callback_url===this.c.origin+'/webhook'
      &&item.fields?.some(field=>(typeof field==='string'?field:field.name)==='feed')))throw new Error('webhook_not_connected');
    const page=await this.call(this.c.page+'/subscribed_apps',{params:{fields:'id,subscribed_fields'}});
    if(!page.data?.some(item=>item.id===APP_ID&&item.subscribed_fields?.includes('feed')))throw new Error('page_not_subscribed');
  }
  post(post){if(!id(post))throw new Error('invalid_object');return this.call(post,{params:{fields:'id,from{id}'}});}
  comment(comment){if(!id(comment))throw new Error('invalid_object');return this.call(comment,{params:{fields:'id,from{id},parent{id},message,created_time,is_hidden,is_private'}});}
  async replies(comment){
    if(!id(comment))throw new Error('invalid_object');
    let after;const result=[];
    for(let i=0;i<3;i++){
      const body=await this.call(comment+'/comments',{params:{fields:'id,from{id},parent{id},message,created_time',limit:'50',...(after?{after}:{})}});
      if(!Array.isArray(body.data))throw new Error('unknown_replies');result.push(...body.data);
      if(!body.paging?.next)return result;
      after=body.paging.cursors?.after;
      if(typeof after!=='string'||!after||after.length>2048||/[\x00-\x1f]/.test(after))throw new Error('unknown_replies');
    }
    throw new Error('too_many_replies');
  }
  reply(comment){if(!id(comment))throw new Error('invalid_object');return this.call(comment+'/comments',{method:'POST',params:{message:REPLY}});}
}
const CREATE=[
  'CREATE TABLE IF NOT EXISTS metadata(page TEXT NOT NULL,key TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(page,key))',
  "CREATE TABLE IF NOT EXISTS jobs(page TEXT NOT NULL,id TEXT NOT NULL,post TEXT NOT NULL,at INTEGER NOT NULL,author TEXT NOT NULL,text_hash TEXT NOT NULL,status TEXT NOT NULL,next_at INTEGER NOT NULL,reply_id TEXT,attempt_at INTEGER,PRIMARY KEY(page,id))",
  'CREATE INDEX IF NOT EXISTS jobs_pending ON jobs(page,status,next_at)',
  'CREATE TABLE IF NOT EXISTS paused(page TEXT NOT NULL,peer TEXT NOT NULL,PRIMARY KEY(page,peer))',
  'CREATE TABLE IF NOT EXISTS locks(page TEXT PRIMARY KEY,holder TEXT NOT NULL,until_at INTEGER NOT NULL)'
];
export class Store{
  constructor(binding,page,now=Date.now){this.db=binding.withSession?.('first-primary')||binding;this.page=page;this.now=now;}
  q(sql,...args){return this.db.prepare(sql).bind(...args);}
  async init(){await this.db.batch(CREATE.map(sql=>this.db.prepare(sql)));}
  async get(key){return (await this.q('SELECT value FROM metadata WHERE page=? AND key=?',this.page,key).first())?.value??null;}
  async set(key,value){await this.q('INSERT INTO metadata VALUES(?,?,?) ON CONFLICT(page,key) DO UPDATE SET value=excluded.value',this.page,key,String(value)).run();}
  async enqueue(events){
    const {n}=await this.q("SELECT count(*) n FROM jobs WHERE page=? AND status IN ('queued','sending','uncertain')",this.page).first();
    if(n+events.length>1000)throw new Error('queue_full');
    for(let i=0;i<events.length;i+=25)await this.db.batch(events.slice(i,i+25).map(e=>this.q("INSERT OR IGNORE INTO jobs(page,id,post,at,author,text_hash,status,next_at) VALUES(?,?,?,?,?,?,'queued',?)",this.page,e.id,e.post,e.at,e.author,e.textHash,this.now())));
  }
  async lock(){
    const holder=crypto.randomUUID(),now=this.now();
    const result=await this.q('INSERT INTO locks VALUES(?,?,?) ON CONFLICT(page) DO UPDATE SET holder=excluded.holder,until_at=excluded.until_at WHERE locks.until_at<=?',this.page,holder,now+45000,now).run();
    return result.meta.changes===1?holder:null;
  }
  async renew(holder){const r=await this.q('UPDATE locks SET until_at=? WHERE page=? AND holder=? AND until_at>?',this.now()+45000,this.page,holder,this.now()).run();if(r.meta.changes!==1)throw new Error('lease_lost');}
  async unlock(holder){await this.q('DELETE FROM locks WHERE page=? AND holder=?',this.page,holder).run();}
  async next(commentId){return commentId
    ?this.q("SELECT * FROM jobs WHERE page=? AND id=? AND status IN ('queued','sending','uncertain') AND next_at<=?",this.page,commentId,this.now()).first()
    :this.q("SELECT * FROM jobs WHERE page=? AND status IN ('queued','sending','uncertain') AND next_at<=? ORDER BY at LIMIT 1",this.page,this.now()).first();}
  async mark(job,status,{replyId=null,delay=0}={}){
    await this.q('UPDATE jobs SET status=?,reply_id=COALESCE(?,reply_id),next_at=? WHERE page=? AND id=?',status,replyId,this.now()+delay,this.page,job.id).run();
  }
  async beginSend(job,holder){
    const now=this.now(),day=Math.floor(now/DAY)*DAY;
    const r=await this.q(`UPDATE jobs SET status='sending',attempt_at=?,next_at=? WHERE page=? AND id=? AND status='queued'
      AND EXISTS(SELECT 1 FROM metadata WHERE page=? AND key='ready' AND value='1')
      AND EXISTS(SELECT 1 FROM locks WHERE page=? AND holder=? AND until_at>?)
      AND (SELECT count(*) FROM jobs WHERE page=? AND status IN ('sent','sending','uncertain','answered') AND attempt_at>=?)<100
      AND (SELECT count(*) FROM jobs WHERE page=? AND author=? AND status IN ('sent','sending','uncertain','answered') AND attempt_at>=?)<3
      AND NOT EXISTS(SELECT 1 FROM jobs WHERE page=? AND author=? AND status IN ('sent','sending','uncertain','answered') AND attempt_at>?)`,
      now,now+60000,this.page,job.id,this.page,this.page,holder,now,this.page,day,this.page,job.author,day,this.page,job.author,now-300000).run();
    return r.meta.changes===1;
  }
  async paused(peer){return !!await this.q('SELECT 1 FROM paused WHERE page=? AND peer=?',this.page,peer).first();}
  async pause(peer){await this.q('INSERT OR IGNORE INTO paused VALUES(?,?)',this.page,peer).run();}
  async cleanup(){await this.q('DELETE FROM jobs WHERE page=? AND at<?',this.page,this.now()-30*DAY).run();}
}
const fatal=error=>['wrong_page','wrong_app','invalid_page_token','webhook_not_connected','page_not_subscribed'].includes(error.message)
  ||error instanceof GraphError&&[10,190,200].includes(error.code);
export async function processJob(job,{c,store,graph,holder,now=Date.now,log=()=>{}}){
  let posting=false;
  try{
    const replies=await graph.replies(job.id);
    if(['sending','uncertain'].includes(job.status)){
      // The exact returned reply ID proves attribution. A reply without a
      // returned ID is never resent or announced as autonomous proof.
      if(job.reply_id){
        const proof=await graph.comment(job.reply_id);
        if(confirmed(proof,job.reply_id,job.id,c.page)){await store.mark(job,'sent');await store.set('last_reply',now());log('SCALA_REPLY_CONFIRMED');return;}
      }
      if(replies.some(reply=>reply.from?.id===c.page)){await store.mark(job,'answered');return;}
      await store.mark(job,'uncertain',{delay:3600000});return;
    }
    const since=Number(await store.get('active_since'));
    const post=await graph.post(job.post),comment=await graph.comment(job.id);
    if(!await authorize(job,post,comment,{page:c.page,since,now:now()})){await store.mark(job,'skipped');return;}
    const peer=await hmac(c.appSecret,job.author);
    if(/^baja[.!\s]*$/i.test(comment.message.trim())){await store.pause(peer);await store.mark(job,'skipped');return;}
    if(replies.some(reply=>reply.from?.id===c.page)){await store.mark(job,'skipped');return;}
    if(await store.paused(peer)){await store.mark(job,'skipped');return;}
    if((await graph.call('me',{params:{fields:'id'}})).id!==c.page)throw new Error('wrong_page');
    const fresh=await graph.comment(job.id);
    if(!await authorize(job,post,fresh,{page:c.page,since,now:now()})||(await graph.replies(job.id)).some(reply=>reply.from?.id===c.page)){
      await store.mark(job,'skipped');return;
    }
    await store.renew(holder);
    if(!c.enabled||!await store.beginSend(job,holder)){await store.mark(job,'queued',{delay:300000});return;}
    posting=true;
    const sent=await graph.reply(job.id);
    if(!id(sent?.id)){await store.mark(job,'uncertain',{delay:60000});log('SCALA_REPLY_UNCERTAIN');return;}
    await store.mark(job,'uncertain',{replyId:sent.id,delay:60000});
    const observed=await graph.comment(sent.id);
    if(confirmed(observed,sent.id,job.id,c.page)){await store.mark(job,'sent');await store.set('last_reply',now());log('SCALA_REPLY_CONFIRMED');}
    else log('SCALA_REPLY_UNCERTAIN');
  }catch(error){
    if(posting)await store.mark(job,'uncertain',{delay:60000});else await store.mark(job,job.status==='queued'?'queued':'uncertain',{delay:60000});
    if(fatal(error))throw error;
    log(posting?'SCALA_REPLY_UNCERTAIN':'SCALA_JOB_DEFERRED');
  }
}
async function credentialDigest(c){return digest(JSON.stringify([APP_ID,c.page,c.origin,c.appSecret,c.pageToken,c.verifyToken]));}
async function isReady(c,store){return c.enabled&&await store.get('ready')==='1'&&await store.get('credential_digest')===await credentialDigest(c);}
export function createWorker({fetchFn=fetch,now=Date.now,log=message=>console.log(message)}={}){
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
  const html=value=>new Response(value,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}});
  async function open(env){const c=config(env),store=new Store(env.DB,c.page,now);await store.init();return {c,store,graph:new Graph(c,fetchFn)};}
  async function run(env,commentId){
    let c,store,graph,holder;
    try{
      ({c,store,graph}=await open(env));if(!c.enabled)return;
      holder=await store.lock();if(!holder)return {retryDelay:5};
      const fingerprint=await credentialDigest(c),ready=await isReady(c,store),checked=Number(await store.get('checked_at'));
      if(!ready){
        if(Number(await store.get('retry_at'))>now())return {retryDelay:60};
        await store.set('ready','0');await graph.connect();
        if(!await store.get('active_since'))await store.set('active_since',Math.floor(now()/1000)*1000);
        await store.set('credential_digest',fingerprint);await store.set('ready','1');await store.set('checked_at',now());
        await store.set('state','conectada_para_pruebas');log('SCALA_META_CONNECTED');
      }else if(!checked||now()-checked>=900000){await graph.validate();await graph.subscriptions();await store.set('checked_at',now());}
      await store.renew(holder);await store.cleanup();
      const job=await store.next(commentId);if(job)await processJob(job,{c,store,graph,holder,now,log});
    }catch(error){
      if(store){
        try{if(fatal(error)||!await isReady(c,store)){await store.set('ready','0');await store.set('state','conexion_meta_pendiente');await store.set('retry_at',now()+300000);}}catch{}
      }
      log('SCALA_META_CHECK_PENDING');
      return {retryDelay:60};
    }finally{if(store&&holder)try{await store.unlock(holder);}catch{}}
  }
  const wake=(env,ctx)=>{if(ctx?.waitUntil)ctx.waitUntil(run(env));};
  async function status(env){
    try{
      const {c,store}=await open(env),ready=await isReady(c,store),last=Number(await store.get('last_reply'))||null;
      return {proyecto:'SCALA Facebook gratuito',estado:!c.enabled?'pausado':ready?'conectada_para_pruebas':await store.get('state')||'conexion_meta_pendiente',
        respuestasHabilitadas:ready,respuestaAutonomaVerificada:!!last,ultimaRespuestaConfirmada:last?new Date(last).toISOString():null,
        publicoGeneralVerificado:false};
    }catch(error){return {proyecto:'SCALA Facebook gratuito',estado:['pagina_nueva_pendiente','credenciales_pendientes','origen_publico_pendiente','base_pendiente'].includes(error.message)?error.message:'configuracion_pendiente',respuestasHabilitadas:false,respuestaAutonomaVerificada:false,publicoGeneralVerificado:false};}
  }
  return {
    async fetch(request,env,ctx){
      const url=new URL(request.url);
      try{
        if(request.method==='GET'&&url.pathname==='/health'){const s=await status(env);if(env.SCALA_ENABLE==='1')wake(env,ctx);return json(s);}
        if(request.method==='GET'&&url.pathname==='/'){
          const s=await status(env);if(env.SCALA_ENABLE==='1')wake(env,ctx);return html(statusHtml(s));
        }
        if(request.method==='GET'&&['/privacidad','/eliminacion-datos'].includes(url.pathname))return html(privacyHtml());
        if(url.pathname!=='/webhook')return json({error:'no_encontrado'},404);
        if(request.method==='GET'){
          const modes=url.searchParams.getAll('hub.mode'),tokens=url.searchParams.getAll('hub.verify_token'),challenges=url.searchParams.getAll('hub.challenge');
          if(modes.length!==1||tokens.length!==1||challenges.length!==1||modes[0]!=='subscribe'
            ||typeof env.META_VERIFY_TOKEN!=='string'||!/^[a-zA-Z0-9_-]{32,256}$/.test(env.META_VERIFY_TOKEN)
            ||tokens[0]!==env.META_VERIFY_TOKEN||!/^\d{1,128}$/.test(challenges[0]))return json({error:'verificacion_rechazada'},403);
          return new Response(challenges[0],{headers:{'Content-Type':'text/plain','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
        }
        if(request.method!=='POST')return json({error:'metodo_no_permitido'},405);
        if(Number(request.headers.get('content-length'))>262144)return json({error:'aviso_demasiado_grande'},413);
        const reader=request.body?.getReader(),parts=[];let length=0;
        if(!reader)return json({error:'solicitud_no_valida'},400);
        while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>262144){await reader.cancel();return json({error:'aviso_demasiado_grande'},413);}parts.push(value);}
        const body=new Uint8Array(length);let offset=0;for(const part of parts){body.set(part,offset);offset+=part.byteLength;}
        if(!await signatureValid(body,request.headers.get('x-hub-signature-256'),env.META_APP_SECRET))return json({error:'firma_rechazada'},403);
        const payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));
        const {c,store}=await open(env);
        if(!c.enabled)return json({received:true,paused:true});
        if(!await isReady(c,store)){wake(env,ctx);return json({error:'conexion_pendiente'},503);}
        const events=await eventsFrom(payload,{page:c.page,since:Number(await store.get('active_since')),now:now()});
        await store.enqueue(events);await store.set('last_webhook',now());
        if(events.length&&env.COMMENTS_QUEUE?.sendBatch){
          try{
            for(let i=0;i<events.length;i+=100)await env.COMMENTS_QUEUE.sendBatch(events.slice(i,i+100).map(event=>({body:{page:c.page,id:event.id}})));
          }catch{log('SCALA_QUEUE_WAKE_PENDING');wake(env,ctx);}
        }else wake(env,ctx);
        log('SCALA_SIGNED_WEBHOOK_RECEIVED');return json({received:true});
      }catch{return json({error:'solicitud_o_conexion_pendiente'},503);}
    },
    async scheduled(controller,env,ctx){if(ctx?.waitUntil)ctx.waitUntil(run(env));else await run(env);},
    async queue(batch,env){
      for(const message of batch.messages){
        const body=message.body;
        if(body?.page!==env.SCALA_PAGE_ID||!id(body.id)){message.ack();continue;}
        const result=await run(env,body.id);
        if(result?.retryDelay)message.retry({delaySeconds:result.retryDelay});else message.ack();
      }
    },
    run,status
  };
}
function statusHtml(s){
  const labels={pagina_nueva_pendiente:'Falta crear y vincular la Página nueva',credenciales_pendientes:'Falta vincular Meta',origen_publico_pendiente:'Falta confirmar la dirección del servicio',base_pendiente:'Falta la base privada',conexion_meta_pendiente:'Conexión con Meta pendiente',configuracion_pendiente:'Configuración pendiente',pausado:'Respuestas pausadas',conectada_para_pruebas:'Conectada para pruebas'};
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SCALA · Asistente de comentarios</title><style>body{margin:0;background:#eef4fa;color:#17334f;font:16px/1.6 system-ui}main{max-width:650px;margin:40px auto;padding:30px;background:white;border-radius:20px}.box{background:#edf5ff;padding:18px;border-radius:12px}a{color:#165ca8}@media(max-width:700px){main{margin:16px;padding:22px}}</style><main><h1>SCALA · Comentarios</h1><p>Página nueva: <strong>${PAGE_NAME}</strong>.</p><div class="box"><strong>${labels[s.estado]||'Configuración pendiente'}</strong><p>${s.respuestasHabilitadas?'Las respuestas están habilitadas para las pruebas de conexión.':'Las respuestas están desactivadas.'}</p></div><p>${s.respuestaAutonomaVerificada?'Se observó una respuesta automática en su hilo de Facebook.':'Todavía falta observar una respuesta automática real.'}</p><p>La atención al público general requiere completar los permisos y la publicación que Meta exija y comprobarla con un comentario real.</p><p>Cuando la conexión está activa, el servicio recibe avisos en la nube aunque tu PC esté apagada. El plan gratuito tiene límites de uso.</p><p><a href="/privacidad">Privacidad</a> · <a href="/eliminacion-datos">Eliminación de datos</a></p></main></html>`;
}
function privacyHtml(){return '<!doctype html><html lang="es"><meta charset="utf-8"><title>Privacidad · SCALA</title><main><h1>Privacidad del asistente de SCALA</h1><p>El asistente recibe avisos firmados de Meta sobre comentarios públicos de la Página Scala Fe - SCALA autorizada. Comprueba el autor de la publicación y el comentario antes de responder. Conserva identificadores, fechas, un resumen criptográfico del texto y estados de atención en una base privada D1 de Cloudflare; los registros de comentarios caducan a los 30 días. Las solicitudes de baja se conservan como identificadores criptográficos para respetarlas. No almacena textos ni nombres de clientes.</p><p>Las claves de la app y la Página se guardan como secretos privados del servicio en Cloudflare. No utiliza una sesión del navegador ni cookies de Facebook. No solicita contraseñas, códigos de verificación o tarjetas de clientes y no confirma pagos ni entregas.</p><p>Para solicitar eliminación de registros o reanudar atención después de una baja, contacta al equipo de SCALA por la Página e indica el enlace del comentario. Esta página no registra ni confirma automáticamente una solicitud. Escribir BAJA pausa nuevas respuestas cuando el asistente recibe y procesa el comentario.</p><p><a href="https://vitacala.online/">SCALA</a></p></main></html>';}
export default createWorker();
