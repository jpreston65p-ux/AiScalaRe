import {readFileSync} from 'node:fs';

export function memoryCounters(stat,events){
  const select=(value,names)=>Object.fromEntries(value.split('\n').flatMap(line=>{
    const [key,count]=line.trim().split(/\s+/);
    return names.includes(key) && /^\d+$/.test(count || '') ? [[key,Number(count)]] : [];
  }));
  return {bytes:select(stat,['anon','file','kernel','shmem']),events:select(events,['high','max','oom','oom_kill'])};
}

export function cloudMemoryCounters(){
  try{return memoryCounters(readFileSync('/sys/fs/cgroup/memory.stat','utf8'),readFileSync('/sys/fs/cgroup/memory.events','utf8'));}
  catch{return {unavailable:true};}
}
