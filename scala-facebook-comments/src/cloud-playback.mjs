// The comment worker reads captions and threads; it does not need to play reels.
// Keep documents, UI code, account checks and all write requests unchanged.
export function isPlaybackRequest(request){
  if(request.method()!=='GET' || request.isNavigationRequest())return false;
  if(request.resourceType()==='media')return true;
  let url;try{url=new URL(request.url());}catch{return false;}
  return url.protocol==='https:' && /(^|\.)fbcdn\.net$/.test(url.hostname)
    && /\.(mp4|webm|m4s|m3u8|mpd)$/i.test(url.pathname);
}

export function isReelImageRequest(request){
  if(request.method()!=='GET' || request.isNavigationRequest() || request.resourceType()!=='image')return false;
  try{
    const url=new URL(request.url()),frame=new URL(request.frame().url());
    // Apply only inside the reel UI, never a login or verification document.
    return url.protocol==='https:' && /(^|\.)fbcdn\.net$/.test(url.hostname)
      && frame.protocol==='https:' && ['www.facebook.com','facebook.com'].includes(frame.hostname)
      && /^\/reel\/\d+\/?$/.test(frame.pathname);
  }catch{return false;}
}

export async function reduceCloudPlayback(context){
  await context.route('**/*',route=>isPlaybackRequest(route.request()) || isReelImageRequest(route.request()) ? route.abort('blockedbyclient') : route.continue());
}
