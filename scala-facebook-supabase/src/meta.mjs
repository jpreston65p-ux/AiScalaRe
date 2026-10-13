// SCALA: official Page webhooks and verified comment replies.
// No browser sessions, files, payment claims or customer message storage.
export const APP_ID='1175553238884267';
export const PAGE_NAME='Scala Kids';
export const GRAPH_VERSION='v26.0';
export const REPLY='¡Hola! 😊 Soy el asistente virtual de SCALA.\n\nSi quieres saber más sobre el producto, escríbenos por WhatsApp 💙.';
export const SCOPES=['pages_manage_engagement','pages_manage_metadata','pages_read_engagement','pages_read_user_content'];
const EXCLUDED_PAGES=new Set(['61576458508649','1121299691061284']);
const DAY=86400000, encoder=new TextEncoder();
const id=value=>typeof value==='string'&&/^\d{5,30}(?:_\d{5,30})?$/.test(value);
const authorId=value=>typeof value==='string'&&/^\d{5,30}$/.test(value);
// Meta can omit personal profile fields on public comments. This key denotes
// a comment, never an inferred person; Page ownership remains mandatory.
const anonymousAuthor=comment=>'comment:'+comment;
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
export async function eventsFrom(payload,{page,since,now=Date.now()}={}){
  if(payload?.object!=='page'||!Array.isArray(payload.entry)||payload.entry.length>100||!Number.isFinite(since))return [];
  const result=[];
  for(const entry of payload.entry){
    if(entry?.id!==page||!Array.isArray(entry.changes)||entry.changes.length>100)continue;
    for(const change of entry.changes){
      const v=change?.value,at=Number(v?.created_time)*1000;
      if(change?.field!=='feed'||v?.item!=='comment'||v.verb!=='add'||!id(v.comment_id)||!id(v.post_id)
        ||v.parent_id!=null&&!id(v.parent_id)||v.from?.id!=null&&!authorId(v.from.id)||v.from?.id===page
        ||typeof v.message!=='string'||!v.message.trim()||v.message.length>30000||!Number.isFinite(at)
        ||at<since||at>now+60000||now-at>DAY)continue;
      // Video callbacks may use a video ID as parent_id instead of post_id.
      // Graph rechecks the actual parent before sending and rejects replies.
      result.push({id:v.comment_id,post:v.post_id,at,author:v.from?.id??anonymousAuthor(v.comment_id),textHash:await digest(v.message)});
    }
  }
  return result;
}
export async function authorize(job,post,comment,{page,since,now=Date.now()}){
  const author=comment?.from?.id;
  if(post?.id!==job.post||post.from?.id!==page||comment?.id!==job.id||comment.parent
    ||!(authorId(job.author)||job.author===anonymousAuthor(job.id))
    ||author===page||author!=null&&!authorId(author)
    ||author!=null&&job.author!==anonymousAuthor(job.id)&&author!==job.author||comment.is_hidden||comment.is_private
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
    // The bound Page ID is the authorization boundary. A display-name change
    // must not disable an already authorized Page or authorize another Page.
    if(page.id!==this.c.page)throw new Error('wrong_page');
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
  async recover(postId,{since,now=Date.now()}={}){
    if(!new RegExp('^'+this.c.page+'_\\d{5,30}$').test(postId||''))throw new Error('invalid_object');
    const post=await this.post(postId);
    if(post.id!==postId||post.from?.id!==this.c.page)throw new Error('wrong_page');
    const body=await this.call(postId+'/comments',{params:{fields:'id,from{id},parent{id},message,created_time,is_hidden,is_private',limit:'50'}});
    if(!Array.isArray(body.data))throw new Error('unknown_comments');
    const jobs=[];
    for(const comment of body.data){
      if(!id(comment?.id)||typeof comment.message!=='string'||!comment.message.trim()||comment.message.length>30000)continue;
      const job={id:comment.id,post:postId,at:Date.parse(comment.created_time),author:comment.from?.id??anonymousAuthor(comment.id),textHash:await digest(comment.message)};
      if(await authorize({...job,text_hash:job.textHash},post,comment,{page:this.c.page,since,now}))jobs.push(job);
    }
    return jobs;
  }
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
    const peer=await hmac(c.peerSecret||c.appSecret,job.author);
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
