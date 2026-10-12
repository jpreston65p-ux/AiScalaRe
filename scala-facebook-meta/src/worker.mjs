import {PAGE_ID,APP_ID,REPLY,authorizeComment,confirmedReply} from './policy.mjs';
import {GraphError} from './graph.mjs';

export async function processJob(job,{store,graph,since,now=Date.now(),log=()=>{}}){
  let posting=false;
  try{
    const existing=await graph.replies(job.id);
    if(['sending','uncertain'].includes(job.status)){
      let found;
      for(const reply of existing){
        if(reply.from?.id!==PAGE_ID || reply.message!==REPLY || reply.parent?.id!==job.id)continue;
        if(job.replyId){if(reply.id===job.replyId)found=reply;}
        else{
          const proof=await graph.call(reply.id,{params:{fields:'id,from{id},parent{id},message,created_time,application{id}'}});
          if(confirmedReply(proof,reply.id,job.id) && proof.application?.id===APP_ID
            && Date.parse(proof.created_time)>=Number(job.attemptAt)-1000)found=proof;
        }
        if(found)break;
      }
      if(found){store.mark(job.id,'sent',{replyId:found.id});log('META_REPLY_CONFIRMED');}
      else store.mark(job.id,'uncertain',{delay:3600000});
      return;
    }
    if(existing.some(reply=>reply.from?.id===PAGE_ID)){store.mark(job.id,'skipped');return;}
    const post=await graph.getPost(job.post),comment=await graph.getComment(job.id);
    if(!authorizeComment(job,post,comment,since,now)){store.mark(job.id,'skipped');return;}
    if(/^baja[.!\s]*$/i.test(comment.message.trim())){store.pause(job.author);store.mark(job.id,'skipped');return;}
    if(!store.allowed(job.author,now)){store.mark(job.id,'skipped');return;}
    if((await graph.call('me',{params:{fields:'id'}})).id!==PAGE_ID)throw new Error('wrong_page');
    const fresh=await graph.getComment(job.id);
    if(!authorizeComment(job,post,fresh,since,Date.now())){store.mark(job.id,'skipped');return;}
    if((await graph.replies(job.id)).some(reply=>reply.from?.id===PAGE_ID)){store.mark(job.id,'skipped');return;}
    store.mark(job.id,'sending');
    posting=true;
    let sent;
    try{sent=await graph.reply(job.id,REPLY);}
    catch(error){
      if(error instanceof GraphError && [4,17,32,613].includes(error.code))store.mark(job.id,'queued',{delay:300000});
      else if(error instanceof GraphError && [10,190,200].includes(error.code)){store.mark(job.id,'queued',{delay:3600000});throw error;}
      else{store.mark(job.id,'uncertain',{delay:60000});log('META_REPLY_UNCERTAIN');}
      return;
    }
    if(!sent?.id){store.mark(job.id,'uncertain',{delay:60000});log('META_REPLY_UNCERTAIN');return;}
    store.mark(job.id,'uncertain',{replyId:sent.id,delay:60000});
    const observed=await graph.getComment(sent.id);
    if(confirmedReply(observed,sent.id,job.id)){store.mark(job.id,'sent',{replyId:sent.id});log('META_REPLY_CONFIRMED');}
    else log('META_REPLY_UNCERTAIN');
  }catch(error){
    if(!posting)store.mark(job.id,job.status==='queued'?'queued':'uncertain',{delay:60000});
    if(error instanceof GraphError && [10,190,200].includes(error.code) || error.message==='wrong_page')throw error;
    log('META_JOB_DEFERRED');
  }
}
