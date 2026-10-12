import {mkdirSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {loadConfig,validateConfig} from './config.mjs';
import {Store} from './store.mjs';
import {FacebookCommentProcessor} from './comment-processor.mjs';
import {launchCommentsContext,commentsBrowserName} from './browser-runtime.mjs';
import {decodeSessionPacket,sessionDigest,cloudTarget} from './cloud-session.mjs';
import {connectionErrorInfo,connectionPageState} from './connection-flow.mjs';
import {FacebookCommentsBrowser} from './comment-browser.mjs';
import {FacebookCommentNotifications} from './comment-notifications.mjs';
import {selectRecentQueries} from './post-view.mjs';
import {fingerprint} from './browser.mjs';

process.umask(0o077);
let context,store,lease,renew,processor,activePage,ownerId,stopping=false;
let stage='inicio',starting=true;
const progress=value=>{stage=value;if(starting)console.log('SCALA_CLOUD_STEP: '+value);};
const report=state=>process.send?.({type:'scala_status',state,at:Date.now()});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
process.once('SIGINT',()=>{stopping=true;});process.once('SIGTERM',()=>{stopping=true;});
try{
  const loaded=loadConfig({live:false}),encoded=process.env[cloudTarget.variable];
  if(process.env.SCALA_FACEBOOK_CLOUD!=='1' || !encoded || commentsBrowserName()!=='firefox')throw new Error('invalid_cloud_session');
  const config=validateConfig({...loaded.config,verifiedPage:true,allowSending:true,
    comments:{...loaded.config.comments,notificationRefreshSeconds:15}}),{catalog,dataDir}=loaded;
  ownerId=config.comments.ownerId;
  const privateDir=join(dataDir,'comments');mkdirSync(privateDir,{recursive:true,mode:0o700});chmodSync(privateDir,0o700);
  store=new Store(privateDir);lease=randomBytes(16).toString('hex');store.acquireRunner(lease);
  renew=setInterval(()=>{try{store.renewRunner(lease);}catch{stopping=true;}},5000);renew.unref();
  const savedStart=Number(store.meta('facebook-comments-active-since'));
  const startedAt=Number.isFinite(savedStart)&&savedStart>0 ? savedStart : Math.floor(Date.now()/60000)*60000;
  store.setMeta('facebook-comments-active-since',startedAt);
  const digest=sessionDigest(encoded);
  let session=store.meta('facebook-cloud-session-digest')!==digest?decodeSessionPacket(encoded,ownerId):null;
  const profile=join(privateDir,'browser-firefox');mkdirSync(profile,{recursive:true,mode:0o700});chmodSync(profile,0o700);
  progress('iniciar_firefox');
  context=await launchCommentsContext(profile,config,{headless:true});
  if(!session){const cookies=await context.cookies('https://www.facebook.com/');if(!cookies.some(c=>c.name==='c_user') || !cookies.some(c=>c.name==='xs'))session=decodeSessionPacket(encoded,ownerId);}
  if(session){await context.clearCookies();await context.addCookies(session.cookies);}
  const page=context.pages()[0] || await context.newPage();
  for(const extra of context.pages())if(extra!==page)await extra.close();
  activePage=page;
  const connector=new FacebookCommentsBrowser(page,config,catalog,progress);
  await connector.verifyAccount();
  const send=async(...args)=>{if(stopping)throw new Error('runner_stopped');store.renewRunner(lease);return connector.send(...args);};
  const savedProof=store.meta('facebook-single-page-last-confirmed-reply');
  if(savedProof && Number.isFinite(Date.parse(savedProof)) && Date.parse(savedProof)<=Date.now())process.send?.({type:'scala_status',state:'historical_confirmation',at:savedProof});
  const log=event=>{console.log('SCALA_CLOUD_EVENT: '+event);if(event==='respuesta_publica_confirmada'){store.setMeta('facebook-single-page-last-confirmed-reply',new Date().toISOString());report('confirmed');}};
  processor=new FacebookCommentProcessor({store,catalog,ownerId,send,log,dailyLimit:config.dailyLimit,startedAt,maxCommentAgeSeconds:config.comments.maxCommentAgeSeconds});
  const recover=process.env.SCALA_FACEBOOK_RECOVER_RECENT==='1' && store.meta('facebook-recovery-completed')!=='1';
  const recovery=new FacebookCommentProcessor({store,catalog,ownerId,send,log,dailyLimit:config.dailyLimit,
    startedAt:Date.now()-config.comments.maxCommentAgeSeconds*1000,maxCommentAgeSeconds:config.comments.maxCommentAgeSeconds});
  for(const url of config.comments.postUrls){
    await connector.open({id:fingerprint(url),url,sourceUrl:url===config.comments.postUrls[0]?config.comments.verificationUrl:undefined});
    progress('leer_comentarios');const events=await connector.comments();
    if(recover){progress('recuperar_consultas_recientes');for(const event of selectRecentQueries(events,{ownerId,maxAgeSeconds:config.comments.maxCommentAgeSeconds}))if(!stopping)await recovery.handleNotification(event);}
  }
  await recovery.drain();
  if(recover)store.setMeta('facebook-recovery-completed','1');
  store.setMeta('facebook-cloud-session-digest',digest);
  const notifications=new FacebookCommentNotifications(page,config,store);notifications.stage=progress;
  // Initial notices are inspected as candidates. The processor's persisted
  // activation time excludes old messages; it never treats a notice as proof
  // of a recent comment until the actual comment date is read.
  notifications.initialized=true;
  await notifications.open();connector.current=null;
  const initial=await notifications.collect();
  const queue=[],pending=new Set(),recent=new Map();
  const enqueue=target=>{if(!pending.has(target.id)){pending.add(target.id);queue.push(target);}};
  initial.forEach(target=>enqueue(target));
  report('watching');starting=false;
  console.log('SCALA_CLOUD_SINGLE_PAGE: Vigilancia y respuestas serializadas en una sola pestaña.');
  while(!stopping){
    if(!new URL(page.url()).pathname.startsWith('/notifications/')){await notifications.open();connector.current=null;}
    for(const target of await notifications.collect())enqueue(target);
    for(const [id,entry] of recent)if(entry.until<Date.now())recent.delete(id);else if(entry.nextCheck<=Date.now() && !pending.has(id)){entry.nextCheck=Date.now()+30000;enqueue(entry.target);}
    store.cleanup();report('heartbeat');
    const target=queue.shift();
    if(target){
      try{
        await connector.open(target);
        const events=await connector.comments();
        if(events.some(event=>processor.valid(event) && !event.isOwn && !event.isReply)){
          if(!recent.has(target.id))recent.set(target.id,{target,until:Date.now()+180000,nextCheck:Date.now()+30000});
        }else recent.delete(target.id);
        for(const event of events)if(!stopping)await processor.handleNotification(event);
        if(!stopping)notifications.complete(target.commentId);
      }catch(error){
        if(error.message==='post_owner_changed'){recent.delete(target.id);notifications.complete(target.commentId);console.log('SCALA_CLOUD_FOREIGN_POST_SKIPPED');}
        else throw error;
      }finally{pending.delete(target.id);}
    }
    if(!stopping)await pause(config.pollSeconds*1000);
  }
  await processor.drain();
}catch(error){
  const info=connectionErrorInfo(error);
  console.log('SCALA_CLOUD_FAILURE: '+JSON.stringify({stage,code:info.code,screen:connectionPageState(activePage,ownerId)}));
  report('connection_required');process.exitCode=78;
}finally{
  stopping=true;clearInterval(renew);
  if(context){try{await context.close();}catch{}}
  if(store){try{store.releaseRunner(lease);}catch{}store.close();}
}
