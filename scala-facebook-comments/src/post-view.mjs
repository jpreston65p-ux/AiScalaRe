import {facebookUrl,facebookPostUrl} from './config.mjs';

export function presentationUrl(target,comments){
  const original=facebookPostUrl(target.url,comments.ownerId);
  const source=new URL(facebookUrl(target.sourceUrl || original));
  if(facebookPostUrl(source.href,comments.ownerId)!==original)throw new Error('post_owner_changed');
  const reel=/^\/reel\/(\d+)\/$/.exec(new URL(original).pathname);
  const normal=reel ? 'https://www.facebook.com/permalink.php?story_fbid='+reel[1]+'&id='+comments.ownerId : original;
  const shown=new URL(comments.postViewByPost?.[original] || normal);
  for(const key of ['comment_id','reply_comment_id'])if(source.searchParams.has(key)){
    const value=source.searchParams.get(key);
    if(!/^\d+$/.test(value || ''))throw new Error('comment_identity_unknown');
    shown.searchParams.set(key,value);
  }
  return shown.href;
}

// Only public timestamp links outside customer comments provide an alias.
// The caller separately verifies the exact publisher and the SCALA composer.
export function postLinksFromDom(element,selectors){
  return [...element.querySelectorAll('a[role="link"][aria-label][href]')]
    .filter(link=>!link.closest(selectors.commentRows+', '+selectors.replyRows))
    .filter(link=>!new URL(link.href).searchParams.has('comment_id'))
    .map(link=>link.getAttribute('href'));
}

export function verifiedPostAliases({actualUrl,targetUrl,shownUrl,links,ownerId}){
  const original=facebookPostUrl(targetUrl,ownerId),shown=facebookPostUrl(shownUrl,ownerId);
  if(facebookPostUrl(actualUrl,ownerId)!==shown)throw new Error('post_owner_changed');
  const seen=new Set();
  for(const href of links){try{seen.add(facebookPostUrl(href,ownerId));}catch{}}
  if(seen.size!==1)throw new Error('post_identity_unknown');
  const primary=[...seen][0];
  if(original!==shown && primary!==original)throw new Error('post_owner_changed');
  return [...new Set([original,shown,primary])];
}

export function selectRecentQueries(events,{ownerId,now=Date.now(),maxAgeSeconds=86400}={}){
  const newest=new Map(),stops=new Map();
  for(const event of events){
    if(!event || event.isOwn!==false || event.isReply===true || event.authorId===ownerId
      || typeof event.authorId!=='string' || !/^[a-z0-9:_-]{1,160}$/i.test(event.authorId)
      || typeof event.text!=='string' || !event.text.trim() || !Number.isFinite(event.at)
      || event.at<now-maxAgeSeconds*1000 || event.at>now+60000)continue;
    if(!newest.has(event.authorId) || newest.get(event.authorId).at<event.at)newest.set(event.authorId,event);
    if(/^(baja|stop|parar|detener|no me respondas|no mas respuestas)[.!]*$/i.test(event.text.trim()))stops.set(event.authorId,event);
  }
  // A recently answered latest query suppresses older questions from that
  // author. A missed opt-out is handled before any commercial invitation.
  return [...newest].map(([author,event])=>stops.get(author)||event)
    .filter(event=>event.hasOwnReply!==true).sort((a,b)=>b.at-a.at);
}
