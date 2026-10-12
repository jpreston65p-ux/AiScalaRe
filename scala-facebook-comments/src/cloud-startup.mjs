// Only a detached application worker started by this server is passed here.
// A blocked browser must not keep consuming resources indefinitely at startup.
export function cloudStartupDeadline(worker,{timeout=180000,graceMs=5000,onTimeout=()=>{},kill=(pid,signal)=>process.kill(pid,signal)}={}){
  if(!Number.isInteger(worker.pid) || worker.pid<2)throw new Error('invalid_worker_process');
  let cancelled=false,expired=false;
  const timer=setTimeout(()=>{
    if(cancelled)return;
    expired=true;onTimeout();
    try{kill(-worker.pid,'SIGTERM');}catch{}
    const force=setTimeout(()=>{try{kill(-worker.pid,'SIGKILL');}catch{}},graceMs);
    force.unref();
  },timeout);
  timer.unref();
  return ()=>{if(expired)return false;cancelled=true;clearTimeout(timer);return true;};
}
