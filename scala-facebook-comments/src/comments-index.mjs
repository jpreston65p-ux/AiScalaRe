import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { loadConfig,validateConfig } from './config.mjs';
import { Store } from './store.mjs';
import { FacebookCommentProcessor } from './comment-processor.mjs';
import {launchCommentsContext,commentsBrowserName} from './browser-runtime.mjs';
import {decodeSessionPacket,sessionDigest,cloudTarget} from './cloud-session.mjs';

process.umask(0o077);
let context,store,lease,renew,processor,stopping=false;
process.once('SIGINT',()=>{stopping=true;});
process.once('SIGTERM',()=>{stopping=true;});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const report=state=>process.send?.({type:'scala_status',state,at:Date.now()});
try {
  const loaded=loadConfig({live:false}),encoded=process.env[cloudTarget.variable];
  const cloud=process.env.SCALA_FACEBOOK_CLOUD==='1';
  if(cloud && (!encoded || encoded.length>87384 || commentsBrowserName()!=='firefox'))throw new Error('invalid_cloud_session');
  const config=validateConfig(cloud?{...loaded.config,verifiedPage:true,allowSending:true}:loaded.config),{catalog,dataDir}=loaded;
  if (config.mode !== 'comments') throw new Error('comments_not_selected');
  const privateDir=join(dataDir,'comments');
  mkdirSync(privateDir,{recursive:true,mode:0o700});chmodSync(privateDir,0o700);
  store=new Store(privateDir);lease=randomBytes(16).toString('hex');store.acquireRunner(lease);
  renew=setInterval(()=>{try{store.renewRunner(lease);}catch{stopping=true;}},5000);
  const {FacebookCommentsBrowser}=await import('./comment-browser.mjs');
  const {FacebookCommentNotifications}=await import('./comment-notifications.mjs');
  const profile=join(privateDir,'browser-'+commentsBrowserName());
  mkdirSync(profile,{recursive:true,mode:0o700});chmodSync(profile,0o700);
  const digest=cloud?sessionDigest(encoded):null;
  let session=cloud && store.meta('facebook-cloud-session-digest')!==digest?decodeSessionPacket(encoded,config.comments.ownerId):null;
  context=await launchCommentsContext(profile,config,{headless:process.env.SCALA_FACEBOOK_HEADLESS==='1'});
  if(cloud && !session){
    const cookies=await context.cookies('https://www.facebook.com/');
    if(!cookies.some(cookie=>cookie.name==='c_user') || !cookies.some(cookie=>cookie.name==='xs'))session=decodeSessionPacket(encoded,config.comments.ownerId);
  }
  if(session){await context.clearCookies();await context.addCookies(session.cookies);}
  const page=context.pages()[0] || await context.newPage();
  const connector=new FacebookCommentsBrowser(page,config,catalog);
  await connector.verifyAccount();
  if(cloud){
    // Validate the observed account and owned controls, never a caller flag.
    for(const url of config.comments.postUrls){const {fingerprint}=await import('./browser.mjs');await connector.open({id:fingerprint(url),url,sourceUrl:url===config.comments.postUrls[0]?config.comments.verificationUrl:undefined});await connector.comments();}
    store.setMeta('facebook-cloud-session-digest',digest);
  }
  const notifications=new FacebookCommentNotifications(await context.newPage(),config,store);
  await notifications.open();
  const initial=await notifications.collect();
  const savedStart=Number(store.meta('facebook-comments-active-since'));
  const startedAt=Number.isFinite(savedStart)&&savedStart>0 ? savedStart : Math.floor(Date.now()/60000)*60000;
  store.setMeta('facebook-comments-active-since',startedAt);
  processor=new FacebookCommentProcessor({store,catalog,ownerId:config.comments.ownerId,dailyLimit:config.dailyLimit,startedAt,maxCommentAgeSeconds:config.comments.maxCommentAgeSeconds,
    send:async (...args)=>{if(stopping)throw new Error('runner_stopped');store.renewRunner(lease);return connector.send(...args);},
    log:event=>{console.log(`[${new Date().toISOString()}] ${event}`);if(event==='respuesta_publica_confirmada')report('confirmed');}});
  const queue=[],pending=new Set(),recent=new Map();
  const enqueue=(target,fresh=true)=>{if(fresh)recent.set(target.id,{target,until:Date.now()+180000});if(!pending.has(target.id)){pending.add(target.id);queue.push(target);}};
  initial.forEach(target=>enqueue(target));
  console.log('Vigilancia de avisos de comentarios: publicaciones antiguas y nuevas, sin límite de 20 publicaciones.');
  console.log('La detección depende de los avisos y la carga de Facebook. No se promete una respuesta instantánea.');
  report('watching');
  const monitor=(async()=>{
    try {
      while(!stopping){
        for(const target of await notifications.collect())enqueue(target);
        // Grouped notifications may only link the last comment. Revisit recently
        // active posts to catch their other fresh comments, using persistent IDs.
        for(const [id,entry] of recent)if(entry.until<Date.now())recent.delete(id);else if(!pending.has(id))enqueue(entry.target,false);
        store.cleanup();
        if(!stopping)await pause(config.pollSeconds*1000);
      }
    }catch(error){stopping=true;throw error;}
  })();
  const worker=(async()=>{
    try {
      while(!stopping){
        const target=queue.shift();
        if(!target){await pause(250);continue;}
        try {
          await connector.open(target);
          for(const event of await connector.comments())if(!stopping)await processor.handleNotification(event);
          if(!stopping)notifications.complete(target.commentId);
        }catch(error){
          if(error.message==='post_owner_changed'){recent.delete(target.id);notifications.complete(target.commentId);console.log('Aviso ajeno a Scala Fe omitido.');}
          else throw error;
        }finally{pending.delete(target.id);}
      }
    }catch(error){stopping=true;throw error;}
  })();
  const completed=await Promise.allSettled([monitor,worker]);
  const failure=completed.find(result=>result.status==='rejected');
  if(failure)throw failure.reason;
  await processor.drain();
}catch(error){
  const messages={
    page_not_verified:'Falta conectar la sesión del programa. En Linux Mint ejecuta: bash CONECTAR_SCALA_FACEBOOK.sh',
    sending_not_enabled:'Las respuestas públicas están desactivadas. Verifica la sesión con CONECTAR_SCALA_FACEBOOK.sh.',
    selectors_not_calibrated:'Los controles de Facebook no coinciden con la interfaz verificada. Respuestas detenidas.',
    sign_in_required:'La sesión del navegador del bot necesita iniciar sesión en Facebook.',
    page_identity_changed:'No se pudo verificar la cuenta Scala Fe del programa. Respuestas detenidas.',
    post_owner_changed:'La publicación no coincide con la cuenta autorizada.',
    unreliable_timestamp:'No se pudo verificar la fecha en español y la zona horaria. Respuestas detenidas.',
    already_running:'Ya hay otro proceso usando el bot de comentarios.',
    notification_view_changed:'La pantalla de avisos cambió. Vigilancia detenida.',
    replies_not_loaded:'Facebook no terminó de mostrar las respuestas existentes. Respuestas detenidas.'
  };
  console.log(messages[error.message] || 'El navegador del bot no pudo completar la conexión. No se activaron respuestas sin verificar.');
  report('connection_required');
  process.exitCode=78;
}finally{
  stopping=true;clearInterval(renew);
  if(context){try{await context.close();}catch{}}
  if(store){try{store.releaseRunner(lease);}catch{}store.close();}
}
