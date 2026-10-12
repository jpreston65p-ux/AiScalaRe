import {createHash,createHmac,timingSafeEqual} from 'node:crypto';

export const PAGE_ID='61576458508649';
export const APP_ID='1175553238884267';
export const VERSION='v26.0';
export const REPLY='¡Hola! 😊 Soy el asistente virtual de SCALA.\n\nSi quieres saber más sobre el producto, escríbenos por WhatsApp 💙.';
export const SCOPES=['pages_manage_engagement','pages_manage_metadata','pages_read_engagement','pages_read_user_content'];
export const objectId=value=>typeof value==='string' && /^\d{5,30}(?:_\d{5,30})?$/.test(value);
export const digest=value=>createHash('sha256').update(String(value)).digest('hex');
export const peerKey=(id,salt)=>createHmac('sha256',salt).update(id).digest('hex');
export function signatureValid(body,signature,secret){
  if(!secret || typeof signature!=='string' || !/^sha256=[a-f0-9]{64}$/.test(signature))return false;
  return timingSafeEqual(Buffer.from(signature.slice(7),'hex'),createHmac('sha256',secret).update(body).digest());
}
export function commentEvents(payload,{since,now=Date.now()}={}){
  if(payload?.object!=='page' || !Array.isArray(payload.entry) || payload.entry.length>100)return [];
  const out=[];
  for(const entry of payload.entry){
    if(entry?.id!==PAGE_ID || !Array.isArray(entry.changes) || entry.changes.length>100)continue;
    for(const change of entry.changes){
      const v=change?.value;
      if(change.field!=='feed' || v?.item!=='comment' || v.verb!=='add'
        || !objectId(v.comment_id) || !objectId(v.post_id) || v.parent_id!==v.post_id
        || typeof v.message!=='string' || !v.message.trim() || v.message.length>30000
        || !/^\d{5,30}$/.test(v.from?.id || '') || v.from.id===PAGE_ID)continue;
      const at=Number(v.created_time)*1000;
      if(!Number.isFinite(at) || !Number.isFinite(since) || at<since || at>now+60000 || now-at>86400000)continue;
      out.push({id:v.comment_id,post:v.post_id,at,author:v.from.id,textHash:digest(v.message)});
    }
  }
  return out;
}
export function authorizeComment(job,post,comment,since,now=Date.now()){
  if(post?.id!==job.post || post.from?.id!==PAGE_ID || comment?.id!==job.id || comment.parent
    || comment.from?.id!==job.author || comment.from.id===PAGE_ID || comment.is_hidden || comment.is_private
    || typeof comment.message!=='string' || !comment.message.trim() || digest(comment.message)!==job.textHash)return false;
  const at=Date.parse(comment.created_time);
  return Number.isFinite(at) && at>=since && at<=now+60000 && now-at<=86400000;
}
export function confirmedReply(reply,id,parent){
  return reply?.id===id && reply.parent?.id===parent && reply.from?.id===PAGE_ID && reply.message===REPLY;
}
