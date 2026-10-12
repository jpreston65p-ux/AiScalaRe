import {readFileSync,readdirSync} from 'node:fs';

export function memoryCounters(stat,events){
  const select=(value,names)=>Object.fromEntries(value.split('\n').flatMap(line=>{
    const [key,count]=line.trim().split(/\s+/);
    return names.includes(key) && /^\d+$/.test(count || '') ? [[key,Number(count)]] : [];
  }));
  return {bytes:select(stat,['anon','file','kernel','shmem']),events:select(events,['high','max','oom','oom_kill'])};
}

export function cloudMemoryCounters(){
  try{
    const counters=memoryCounters(readFileSync('/sys/fs/cgroup/memory.stat','utf8'),readFileSync('/sys/fs/cgroup/memory.events','utf8'));
    const statuses=[];
    for(const id of readdirSync('/proc').filter(name=>/^\d+$/.test(name))){try{statuses.push(readFileSync('/proc/'+id+'/status','utf8'));}catch{}}
    return {...counters,processes:processMemoryCounters(statuses,process.pid,process.getuid?.())};
  }
  catch{return {unavailable:true};}
}

// Numerical aggregates of this application's own process tree only. No
// command lines, paths, URLs, cookie values or other process names are logged.
export function processMemoryCounters(statuses,parentPid,uid){
  const processes=statuses.map(status=>{
    const fields=Object.fromEntries(String(status).split('\n').filter(line=>line.includes(':')).map(line=>{const i=line.indexOf(':');return [line.slice(0,i),line.slice(i+1).trim()];}));
    const bytes=value=>/^\d+\s+kB$/.test(value || '') ? Number(value.split(/\s+/)[0])*1024 : 0;
    return {pid:Number(fields.Pid),parent:Number(fields.PPid),uid:Number(fields.Uid?.split(/\s+/)[1]),
      kind:fields.Name==='node'?'node':fields.Name==='firefox'?'firefox':/^(Web Content|Isolated Web Co|Web Isolated Co)$/.test(fields.Name || '')?'content':'other',
      resident:bytes(fields.VmRSS),anonymous:bytes(fields.RssAnon)};
  }).filter(item=>Number.isInteger(item.pid)&&Number.isInteger(item.parent)&&item.uid===uid);
  const own=new Set([parentPid]);
  for(let changed=true;changed;){changed=false;for(const item of processes)if(own.has(item.parent)&&!own.has(item.pid)){own.add(item.pid);changed=true;}}
  const sums={};
  for(const item of processes)if(own.has(item.pid)){
    const group=sums[item.kind] ||= {count:0,resident:0,anonymous:0};
    group.count++;group.resident+=item.resident;group.anonymous+=item.anonymous;
  }
  return sums;
}

