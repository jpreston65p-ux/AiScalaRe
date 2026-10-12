import {mkdirSync,chmodSync,writeFileSync,renameSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {randomBytes} from 'node:crypto';
import {loadConfig,validateConfig,root,facebookPostUrl} from './config.mjs';
import {fingerprint} from './browser.mjs';
import {FacebookCommentsBrowser} from './comment-browser.mjs';
import {FacebookCommentNotifications} from './comment-notifications.mjs';
import {Store} from './store.mjs';
import {launchCommentsContext,commentsBrowserName} from './browser-runtime.mjs';
import {cloudTarget,encodeSessionPacket} from './cloud-session.mjs';
import {uploadSession} from './cloud-upload.mjs';
import {facebookProfileId,connectionErrorInfo,connectionPageState,waitForConnection} from './connection-flow.mjs';

process.umask(0o077);
let context,terminal,store,lease,renew,profilePage,workPage,noticesPage,diagnosticPath;
let stage='inicio',browserClosed=true,closing=false,ownerId;
const cancel=new AbortController();
const interrupt=()=>{
  cancel.abort();closing=true;
  if(context)void context.close().catch(()=>{});
};
process.once('SIGINT',interrupt);
process.once('SIGTERM',interrupt);
const progress=value=>{stage=value;console.log('SCALA_PASO_CONEXION: '+value);};
const reportError=error=>{
  const original=connectionErrorInfo(error);
  const info=browserClosed && context && ['error_no_clasificado','tiempo_de_espera_agotado'].includes(original.code)
    ? connectionErrorInfo(new Error('browser_closed')) : original;
  const page=stage.includes('avisos') ? noticesPage : ['comprobar_perfil_abierto','esperar_perfil_manual','abrir_facebook'].includes(stage) ? profilePage : workPage || profilePage;
  const lines=['SCALA_ETAPA_FALLIDA: '+stage,'SCALA_ERROR_CONEXION: '+info.code,'SCALA_PANTALLA: '+connectionPageState(page,ownerId)];
  console.log(info.message);console.log(lines.join('\n'));
  if(diagnosticPath){try{writeFileSync(diagnosticPath,lines.join('\n')+'\n',{mode:0o600});}catch{}}
};
try {
  const args=process.argv.slice(2),cloud=args.includes('--nube');
  if(args.some(value=>value!=='--nube'))throw new Error('invalid_arguments');
  if(cloud)process.env.SCALA_FACEBOOK_BROWSER='firefox';
  if(!process.stdin.isTTY || !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY)throw new Error('desktop_required');
  const loaded=loadConfig({live:false});
  const config=validateConfig({...loaded.config,verifiedPage:true,allowSending:true});
  if(config.mode!=='comments')throw new Error('comments_not_selected');
  ownerId=config.comments.ownerId;
  if(cloud && ownerId!==cloudTarget.owner)throw new Error('page_identity_changed');
  const privateDir=join(loaded.dataDir,'comments'),profile=join(privateDir,'browser-'+commentsBrowserName());
  mkdirSync(profile,{recursive:true,mode:0o700});chmodSync(privateDir,0o700);chmodSync(profile,0o700);
  diagnosticPath=join(privateDir,'diagnostico-conexion.txt');
  store=new Store(privateDir);lease=randomBytes(16).toString('hex');store.acquireRunner(lease);
  renew=setInterval(()=>{try{store.renewRunner(lease);}catch{interrupt();}},5000);
  terminal=createInterface({input:process.stdin,output:process.stdout});
  terminal.on('SIGINT',interrupt);
  const profileUrl='https://www.facebook.com/profile.php?id='+ownerId;
  const completed=await waitForConnection({
    prepare:async()=>{
      if(context && !browserClosed)return;
      progress('iniciar_firefox');
      context=await launchCommentsContext(profile,config,{headless:false});
      browserClosed=false;workPage=null;noticesPage=null;
      context.on('close',()=>{
        browserClosed=true;
        if(!closing)console.log('SCALA_NAVEGADOR_CERRADO: Firefox se cerró. Pulsa Enter para abrirlo de nuevo; SALIR para terminar.');
      });
      profilePage=context.pages()[0] || await context.newPage();
      progress('abrir_facebook');
      try{await profilePage.goto(profileUrl,{waitUntil:'commit',timeout:60000});}catch(error){reportError(error);}
      console.log('Inicia sesión en este Firefox y selecciona Scala Fe. La comprobación no publica comentarios.');
      console.log('Si no estás en su perfil, abre: '+profileUrl);
      console.log('No escribas contraseñas ni códigos en la terminal o en el chat.');
    },
    question:prompt=>terminal.question(prompt,{signal:cancel.signal}),
    check:async()=>{
      cancel.signal.throwIfAborted();
      if(browserClosed)throw new Error('browser_closed');
      progress('esperar_perfil_manual');
      profilePage=context.pages().find(page=>!page.isClosed() && facebookProfileId(page.url())===ownerId)
        || (!profilePage?.isClosed() ? profilePage : context.pages().find(page=>!page.isClosed()));
      if(!profilePage)throw new Error('browser_closed');
      await new FacebookCommentsBrowser(profilePage,config,loaded.catalog,progress).verifyAccount({navigate:false});
      // Keep the login/profile tab available, even if a later check fails.
      if(!workPage || workPage.isClosed())workPage=await context.newPage();
      const connector=new FacebookCommentsBrowser(workPage,config,loaded.catalog,progress);
      for(const value of config.comments.postUrls){
        const url=facebookPostUrl(value,ownerId);
        await connector.open({id:fingerprint(url),url,sourceUrl:value===config.comments.postUrls[0]?config.comments.verificationUrl:undefined});
        progress('leer_comentarios');await connector.comments();
      }
      if(!noticesPage || noticesPage.isClosed())noticesPage=await context.newPage();
      const notifications=new FacebookCommentNotifications(noticesPage,config,store);
      notifications.stage=progress;await notifications.open();
      // Activation, rather than the login wizard, initializes the baseline.
      if(cloud){
        cancel.signal.throwIfAborted();
        progress('enviar_sesion_a_railway');
        console.log('Cuenta y controles comprobados. Se vinculará esta sesión propia al servicio de comentarios de Railway.');
        const encoded=encodeSessionPacket({version:1,browser:'firefox',ownerId,createdAt:Date.now(),cookies:await context.cookies('https://www.facebook.com/')},ownerId);
        uploadSession(encoded);
      }
    },
    onError:reportError
  });
  if(completed){
    cancel.signal.throwIfAborted();
    const target=resolve(root,'facebook.config.json'),temporary=target+'.tmp';
    writeFileSync(temporary,JSON.stringify(config,null,2)+'\n',{mode:0o600});renameSync(temporary,target);
    console.log('SCALA_CONEXION_COMPLETADA');
    console.log(cloud ? 'Sesión enviada a Railway. La nube comprobará el acceso antes de habilitar respuestas. El Firefox de conexión se cerrará ahora; no necesitas mantener esta terminal abierta.' : 'Sesión del programa y controles comprobados. Inicia con: bash INICIAR_SCALA_FACEBOOK.sh');
    console.log('Todavía hace falta verificar una respuesta automática a un comentario nuevo.');
  }else console.log('Conexión cancelada por ti. Se cerrará Firefox.');
}catch(error){
  if(cancel.signal.aborted)console.log('Conexión cancelada. Puedes volver a abrirla cuando quieras.');
  else {reportError(error);process.exitCode=78;}
}finally{
  closing=true;clearInterval(renew);process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);terminal?.close();
  if(context){try{await context.close();}catch{}}
  if(store){try{store.releaseRunner(lease);}catch{}store.close();}
}
