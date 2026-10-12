import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {cloudTarget,decodeSessionPacket} from './cloud-session.mjs';

export function sessionUploadArguments(){return ['variable','set',cloudTarget.variable,'--stdin','--project',cloudTarget.project,'--environment',cloudTarget.environment,'--service',cloudTarget.service,'--json'];}

export function uploadSession(encoded,{run=spawnSync,tty=process.stdin.isTTY}={}){
  decodeSessionPacket(encoded,cloudTarget.owner);
  const env={...process.env,RAILWAY_CALLER:'skill:use-railway@1.3.5',RAILWAY_AGENT_SESSION:'scala-facebook-'+randomUUID()};
  let command='railway',prefix=[];
  let result=run(command,['whoami','--json'],{env,encoding:'utf8',timeout:20000,stdio:['ignore','pipe','pipe']});
  if(result.error?.code==='ENOENT'){
    command='npx';prefix=['--yes','--package=@railway/cli@5.64.2','--','railway'];
    result=run(command,[...prefix,'whoami','--json'],{env,encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']});
  }
  if(result.status!==0){
    if(!tty)throw new Error('railway_login_required');
    console.log('Inicia sesión en Railway con la cuenta donde está SCALA. El acceso se realiza en el formulario de Railway.');
    result=run(command,[...prefix,'login'],{env,stdio:'inherit',timeout:300000});
    if(result.status!==0)throw new Error('railway_login_required');
  }
  // Credentials go through stdin to this exact Facebook service. Never put
  // their value in argv, URLs, files, console output or public source.
  result=run(command,[...prefix,...sessionUploadArguments()],{env,input:encoded,encoding:'utf8',timeout:60000,maxBuffer:1048576,stdio:['pipe','pipe','pipe']});
  if(result.status!==0)throw new Error('cloud_upload_failed');
}
