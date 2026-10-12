import {createServer} from 'node:http';
import {fork} from 'node:child_process';
import {cloudTarget} from './cloud-session.mjs';
import {cloudMemoryCounters} from './cloud-resources.mjs';
import {cloudStartupDeadline} from './cloud-startup.mjs';
import {statusPage,privacyPage} from './cloud-page.mjs';

process.umask(0o077);
let state=process.env[cloudTarget.variable]?'comprobando_cuenta':'pendiente_de_vincular';
let worker,lastReply=null,lastChecked=null,enabled=false,stopping=false,resourceTimer,cancelStartup;
const server=createServer((request,response)=>{
  const send=(type,body,status=200)=>{response.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});response.end(body);};
  if(request.method!=='GET')return send('text/plain','No disponible',404);
  if(request.url==='/health')return send('application/json',JSON.stringify({proyecto:'SCALA Facebook',estado:state,
    respuestasHabilitadas:enabled,respuestaAutonomaVerificada:lastReply!==null,ultimaRespuestaConfirmada:lastReply,ultimaComprobacion:lastChecked}));
  if(request.url==='/')return send('text/html; charset=utf-8',statusPage());
  if(['/privacidad','/eliminacion-datos'].includes(request.url))return send('text/html; charset=utf-8',privacyPage());
  return send('text/plain','No encontrado',404);
});
await new Promise(resolve=>server.listen(Number(process.env.PORT || 8080),'0.0.0.0',resolve));
if(!process.env[cloudTarget.variable])console.log('SCALA_CLOUD_WAITING_LOGIN: Falta la sesión propia del programa.');
else{
  worker=fork(new URL('./profile-worker.mjs',import.meta.url),[],{detached:true,execArgv:['--max-old-space-size=128'],
    env:{...process.env,SCALA_FACEBOOK_CLOUD:'1',SCALA_FACEBOOK_HEADLESS:'1',SCALA_FACEBOOK_BROWSER:'firefox'},stdio:['ignore','inherit','inherit','ipc']});
  cancelStartup=cloudStartupDeadline(worker,{onTimeout:()=>{
    enabled=false;state='comprobacion_no_completada';
    console.log('SCALA_CLOUD_STARTUP_TIMEOUT: Comprobación detenida. Respuestas desactivadas.');
    console.log('SCALA_CLOUD_RESOURCES: '+JSON.stringify(cloudMemoryCounters()));
  }});
  resourceTimer=setInterval(()=>console.log('SCALA_CLOUD_RESOURCES: '+JSON.stringify(cloudMemoryCounters())),30000);resourceTimer.unref();
  worker.on('message',message=>{
    if(message?.type!=='scala_status')return;
    if(message.state==='watching'){
      if(!cancelStartup())return;
      state='vigilando_comentarios';enabled=true;lastChecked=new Date().toISOString();
      console.log('SCALA_CLOUD_WATCHING: Scala Fe y controles verificados.');
    }
    if(message.state==='heartbeat')lastChecked=new Date().toISOString();
    if(message.state==='historical_confirmation' && typeof message.at==='string' && Number.isFinite(Date.parse(message.at)) && Date.parse(message.at)<=Date.now())lastReply=message.at;
    if(message.state==='confirmed'){lastReply=new Date().toISOString();console.log('SCALA_CLOUD_REPLY_CONFIRMED: Respuesta autónoma observada en Facebook.');}
    if(message.state==='connection_required'){state='conexion_necesaria';enabled=false;console.log('SCALA_CLOUD_CONNECTION_REQUIRED: Respuestas detenidas.');}
  });
  const failed=()=>{cancelStartup();clearInterval(resourceTimer);enabled=false;if(!stopping){if(state!=='comprobacion_no_completada')state='conexion_necesaria';console.log('SCALA_CLOUD_WORKER_STOPPED: El proceso de comentarios no está activo.');}};
  worker.once('error',failed);worker.once('exit',failed);
}
const stop=()=>{stopping=true;clearInterval(resourceTimer);enabled=false;worker?.kill('SIGTERM');server.close(()=>{if(!worker || worker.exitCode!==null)process.exit(0);else worker.once('exit',()=>process.exit(0));});};
process.once('SIGINT',stop);process.once('SIGTERM',stop);
