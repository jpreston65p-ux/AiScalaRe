import {createServer} from 'node:http';
import {fork} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {loadConfig,validateConfig} from './config.mjs';
import {launchCommentsContext,cloudBrowserHeadless} from './browser-runtime.mjs';
import {cloudTarget} from './cloud-session.mjs';
import {cloudMemoryCounters} from './cloud-resources.mjs';

process.umask(0o077);
let state='comprobando_navegador',worker,lastReply=null,enabled=false,stopping=false,resourceTimer;
const server=createServer((request,response)=>{
  if(request.method!=='GET' || request.url!=='/health'){response.writeHead(404);response.end();return;}
  response.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
  response.end(JSON.stringify({proyecto:'SCALA Facebook',estado:state,respuestasHabilitadas:enabled,respuestaAutonomaVerificada:lastReply!==null,ultimaRespuestaConfirmada:lastReply}));
});
await new Promise(resolve=>server.listen(Number(process.env.PORT || 8080),'0.0.0.0',resolve));
const profile=mkdtempSync(join(tmpdir(),'scala-firefox-preflight-'));
let context;
try{
  process.env.SCALA_FACEBOOK_BROWSER='firefox';
  const headless=cloudBrowserHeadless();
  const {config}=loadConfig({live:false});
  context=await launchCommentsContext(profile,validateConfig({...config,verifiedPage:true,allowSending:true}),{headless});
  await context.close();context=null;
  console.log('SCALA_CLOUD_BROWSER_OK: Firefox y sus filtros propios de contenido comprobados.');
  if(!process.env[cloudTarget.variable]){
    state='pendiente_de_vincular';
    console.log('SCALA_CLOUD_WAITING_LOGIN: Vincula la sesión propia desde Linux Mint con CONECTAR_SCALA_FACEBOOK.sh --nube. Respuestas desactivadas.');
  }else{
    state='comprobando_cuenta';
    worker=fork(new URL('./comments-index.mjs',import.meta.url),[],{env:{...process.env,SCALA_FACEBOOK_CLOUD:'1',SCALA_FACEBOOK_HEADLESS:headless?'1':'0'},stdio:['ignore','inherit','inherit','ipc']});
    resourceTimer=setInterval(()=>console.log('SCALA_CLOUD_RESOURCES: '+JSON.stringify(cloudMemoryCounters())),20000);
    resourceTimer.unref();
    worker.on('message',message=>{
      if(message?.type!=='scala_status')return;
      if(message.state==='watching'){clearInterval(resourceTimer);state='vigilando_comentarios';enabled=true;console.log('SCALA_CLOUD_WATCHING: Cuenta Scala Fe y controles verificados.');}
      if(message.state==='confirmed'){lastReply=new Date().toISOString();console.log('SCALA_CLOUD_REPLY_CONFIRMED: Respuesta autónoma observada en Facebook.');}
      if(message.state==='connection_required'){clearInterval(resourceTimer);state='conexion_necesaria';enabled=false;console.log('SCALA_CLOUD_CONNECTION_REQUIRED: Revisa la sesión del programa. Respuestas detenidas.');}
    });
    const failed=()=>{clearInterval(resourceTimer);enabled=false;if(!stopping){state='conexion_necesaria';console.log('SCALA_CLOUD_WORKER_STOPPED: El proceso de comentarios no está activo.');}};
    worker.once('error',failed);worker.once('exit',failed);
  }
}catch{
  state='navegador_no_disponible';enabled=false;
  console.log('SCALA_CLOUD_BROWSER_FAILED: No se pudo comprobar el navegador. Respuestas desactivadas.');
}finally{
  if(context){try{await context.close();}catch{}}
  rmSync(profile,{recursive:true,force:true});
}
const stop=()=>{stopping=true;clearInterval(resourceTimer);enabled=false;worker?.kill('SIGTERM');server.close(()=>{if(!worker || worker.exitCode!==null)process.exit(0);else worker.once('exit',()=>process.exit(0));});};
process.once('SIGINT',stop);process.once('SIGTERM',stop);
