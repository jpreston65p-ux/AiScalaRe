export function reconnectPolicy(status, attempts) {
  if([401,403,411,440,500].includes(status)) return { retry:false, delay:0 };
  if(status === 515) return { retry:true, delay:1000 };
  return { retry:true, delay:Math.min(60000,2000*2**Math.min(attempts,5)) };
}
