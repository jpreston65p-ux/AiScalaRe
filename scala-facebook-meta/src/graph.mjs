import {createHmac} from 'node:crypto';
import {APP_ID,PAGE_ID,VERSION,SCOPES,objectId} from './policy.mjs';

export class GraphError extends Error{
  constructor(code=0,status=0){super('meta_request_failed');this.code=Number(code)||0;this.status=Number(status)||0;}
}
export class Graph{
  constructor(config,{fetchFn=fetch}={}){this.c=config;this.fetchFn=fetchFn;}
  async call(path,{method='GET',params={},app=false}={}){
    if(!/^(?:me|debug_token|\d{5,30}(?:_\d{5,30})?)(?:\/(?:comments|subscribed_apps|subscriptions))?$/.test(path)
      || !['GET','POST'].includes(method) || method==='POST' && !/\/(comments|subscriptions|subscribed_apps)$/.test(path))throw new Error('invalid_meta_request');
    const token=app?APP_ID+'|'+this.c.appSecret:this.c.pageToken;
    const data=new URLSearchParams({...params,appsecret_proof:createHmac('sha256',this.c.appSecret).update(token).digest('hex')});
    const url=new URL('https://graph.facebook.com/'+VERSION+'/'+path);
    const options={method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token}};
    if(method==='GET')url.search=data.toString();else{options.headers['Content-Type']='application/x-www-form-urlencoded';options.body=data;}
    let response;try{response=await this.fetchFn(url,options);}catch{throw new GraphError();}
    let body;try{body=await response.json();}catch{throw new GraphError(0,response.status);}
    if(!response.ok || body?.error)throw new GraphError(body?.error?.code,response.status);
    return body;
  }
  async validate(){
    const app=await this.call(APP_ID,{app:true,params:{fields:'id,name'}});
    if(app.id!==APP_ID)throw new Error('wrong_meta_app');
    const token=await this.call('debug_token',{app:true,params:{input_token:this.c.pageToken}});
    const d=token?.data;
    if(!d?.is_valid || d.app_id!==APP_ID || d.type!=='PAGE' || !SCOPES.every(scope=>d.scopes?.includes(scope))
      || Number(d.expires_at)>0 && Number(d.expires_at)*1000<Date.now())throw new Error('invalid_page_token');
    const page=await this.call('me',{params:{fields:'id,name'}});
    if(page.id!==PAGE_ID)throw new Error('wrong_page');
    return page;
  }
  async configure(origin,verifyToken){
    await this.call(APP_ID+'/subscriptions',{method:'POST',app:true,params:{object:'page',callback_url:origin+'/webhook',fields:'feed',verify_token:verifyToken}});
    await this.call(PAGE_ID+'/subscribed_apps',{method:'POST',params:{subscribed_fields:'feed'}});
    await this.checkSubscriptions(origin);
  }
  async checkSubscriptions(origin){
    const app=await this.call(APP_ID+'/subscriptions',{app:true});
    if(!app.data?.some(item=>item.object==='page' && item.active===true && item.callback_url===origin+'/webhook'
      && item.fields?.some(field=>(typeof field==='string'?field:field.name)==='feed')))throw new Error('webhook_not_connected');
    const page=await this.call(PAGE_ID+'/subscribed_apps',{params:{fields:'id,subscribed_fields'}});
    if(!page.data?.some(item=>item.id===APP_ID && item.subscribed_fields?.includes('feed')))throw new Error('page_not_subscribed');
  }
  getPost(id){if(!objectId(id))throw new Error('invalid_object');return this.call(id,{params:{fields:'id,from{id}'}});}
  getComment(id){if(!objectId(id))throw new Error('invalid_object');return this.call(id,{params:{fields:'id,from{id},parent{id},message,created_time,is_hidden,is_private'}});}
  async replies(id){
    const result=[];let after;
    for(let page=0;page<20;page++){
      const body=await this.call(id+'/comments',{params:{fields:'id,from{id},parent{id},message',limit:'100',...(after?{after}:{})}});
      if(!Array.isArray(body.data))throw new Error('unknown_replies');result.push(...body.data);
      if(!body.paging?.next)return result;
      after=body.paging.cursors?.after;
      if(typeof after!=='string' || after.length>2048 || /[\x00-\x1f]/.test(after))throw new Error('unknown_replies');
    }
    throw new Error('too_many_replies');
  }
  reply(id,message){return this.call(id+'/comments',{method:'POST',params:{message}});}
}
