import {readFileSync,readdirSync} from 'node:fs';

export function sandboxProcess(status){
  const fields=Object.fromEntries(String(status).split('\n').filter(line=>line.includes(':')).map(line=>{const i=line.indexOf(':');return [line.slice(0,i),line.slice(i+1).trim()];}));
  return {pid:Number(fields.Pid),parent:Number(fields.PPid),name:fields.Name,uid:Number(fields.Uid?.split(/\s+/)[1]),seccomp:Number(fields.Seccomp),filters:Number(fields.Seccomp_filters),noNewPrivileges:Number(fields.NoNewPrivs)};
}

export function protectedFirefoxContent(processes,parentPid,uid){
  const parent=processes.find(item=>item.pid===parentPid);
  if(!parent || !Number.isInteger(parent.filters))return [];
  const descendants=new Set([parentPid]);
  for(let changed=true;changed;){changed=false;for(const item of processes)if(descendants.has(item.parent) && !descendants.has(item.pid)){descendants.add(item.pid);changed=true;}}
  return processes.filter(item=>descendants.has(item.pid) && item.pid!==parentPid && item.uid===uid
    && /^(Web Content|Isolated Web Co|Web Isolated Co)$/.test(item.name || '')
    && item.seccomp===2 && item.noNewPrivileges===1 && Number.isInteger(item.filters) && item.filters>parent.filters);
}

// Read only the kernel's public status of this application's own children.
// Extra content filters distinguish Firefox's sandbox from the container's
// existing seccomp filter. No cookies, environment or browser internals read.
export async function verifyFirefoxSandbox(){
  if(process.platform!=='linux' || process.getuid?.()===0)throw new Error('non_root_linux_required');
  const until=Date.now()+5000;
  do{
    const processes=[];
    for(const id of readdirSync('/proc').filter(name=>/^\d+$/.test(name))){try{processes.push(sandboxProcess(readFileSync('/proc/'+id+'/status','utf8')));}catch{}}
    const children=protectedFirefoxContent(processes,process.pid,process.getuid());
    if(children.length)return {contentProcesses:children.length,seccomp:true,noNewPrivileges:true,extraContentFilters:true};
    await new Promise(resolve=>setTimeout(resolve,200));
  }while(Date.now()<until);
  throw new Error('firefox_content_sandbox_unverified');
}
