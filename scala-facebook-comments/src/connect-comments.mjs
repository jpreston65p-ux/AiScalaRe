import { mkdirSync, chmodSync, writeFileSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { randomBytes } from 'node:crypto';
import { loadConfig, validateConfig, root, facebookPostUrl } from './config.mjs';
import { fingerprint } from './browser.mjs';
import { FacebookCommentsBrowser } from './comment-browser.mjs';
import { Store } from './store.mjs';
import {launchCommentsContext,commentsBrowserName} from './browser-runtime.mjs';
import {cloudTarget,encodeSessionPacket} from './cloud-session.mjs';
import {uploadSession} from './cloud-upload.mjs';

process.umask(0o077);
let context,terminal,store,lease,renew;
let stage='inicio';
const progress=value=>{stage=value;console.log('SCALA_PASO_CONEXION: '+value);};
try {
  const args=process.argv.slice(2),cloud=args.includes('--nube');
  if(args.some(value=>value!=='--nube'))throw new Error('invalid_arguments');
  if(cloud)process.env.SCALA_FACEBOOK_BROWSER='firefox';
  if (!process.stdin.isTTY || !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) throw new Error('desktop_required');
  const loaded=loadConfig({live:false});
  const config=validateConfig({...loaded.config,verifiedPage:true,allowSending:true});
  if (config.mode !== 'comments') throw new Error('comments_not_selected');
  if(cloud && config.comments.ownerId!==cloudTarget.owner)throw new Error('page_identity_changed');
  const privateDir=join(loaded.dataDir,'comments'),profile=join(privateDir,'browser-'+commentsBrowserName());
  mkdirSync(profile,{recursive:true,mode:0o700});chmodSync(privateDir,0o700);chmodSync(profile,0o700);
  store=new Store(privateDir);lease=randomBytes(16).toString('hex');store.acquireRunner(lease);
  renew=setInterval(()=>{try{store.renewRunner(lease);}catch{terminal?.close();void context?.close();}},5000);
  context=await launchCommentsContext(profile,config,{headless:false});
  const page=context.pages()[0] || await context.newPage();
  await page.goto('https://www.facebook.com/',{waitUntil:'domcontentloaded',timeout:30000});
  console.log('Inicia sesión en la ventana de Facebook y selecciona Scala Fe. Este paso no publica comentarios.');
  console.log('No escribas tu contraseña ni códigos en la terminal o en el chat.');
  terminal=createInterface({input:process.stdin,output:process.stdout});
  await terminal.question('Cuando veas Scala Fe en el navegador, pulsa Enter para comprobar la conexión: ');
  const profilePage=context.pages().find(candidate=>{
    try {const url=new URL(candidate.url());return url.hostname==='www.facebook.com' && url.pathname==='/profile.php' && url.searchParams.get('id')===config.comments.ownerId;} catch{return false;}
  }) || page;
  const connector=new FacebookCommentsBrowser(profilePage,config,loaded.catalog,progress);
  await connector.verifyAccount();
  for (const value of config.comments.postUrls) {
    const url=facebookPostUrl(value,config.comments.ownerId);
    await connector.open({id:fingerprint(url),url,sourceUrl:value===config.comments.postUrls[0]?config.comments.verificationUrl:undefined});
    progress('leer_comentarios');
    await connector.comments();
  }
  const {FacebookCommentNotifications}=await import('./comment-notifications.mjs');
  const notifications=new FacebookCommentNotifications(await context.newPage(),config,store);
  notifications.stage=progress;
  await notifications.open();
  // Do not baseline events here: activation starts with the runner, not login.
  if(cloud){
    progress('enviar_sesion_a_railway');
    console.log('Cuenta y controles comprobados. Se conectará esta sesión propia del programa al servicio scala-facebook-comentarios de Railway.');
    const encoded=encodeSessionPacket({version:1,browser:'firefox',ownerId:config.comments.ownerId,createdAt:Date.now(),cookies:await context.cookies('https://www.facebook.com/')},config.comments.ownerId);
    uploadSession(encoded);
  }
  const target=resolve(root,'facebook.config.json'),temporary=target+'.tmp';
  writeFileSync(temporary,JSON.stringify(config,null,2)+'\n',{mode:0o600});renameSync(temporary,target);
  console.log(cloud?'Sesión enviada a Railway. El servicio comprobará el acceso antes de habilitar respuestas. No necesitas dejar abierta esta terminal.':'Sesión del programa y controles comprobados. Inicia con: bash INICIAR_SCALA_FACEBOOK.sh');
  console.log('Una respuesta automática todavía debe verificarse al recibir un comentario nuevo.');
}catch(error){
  const messages={desktop_required:'La conexión inicial necesita la terminal y el escritorio de Linux Mint.',
    invalid_arguments:'Para conectar la nube usa: bash CONECTAR_SCALA_FACEBOOK.sh --nube',
    invalid_cloud_session:'No se pudo preparar una sesión propia válida para la nube. No se enviaron credenciales.',
    railway_login_required:'Falta completar el inicio de sesión autorizado en Railway.',
    cloud_upload_failed:'Railway no aceptó la sesión para el servicio de Facebook. Comprueba que abriste la cuenta donde está SCALA.',
    firefox_content_sandbox_unverified:'No se pudo verificar el aislamiento de Firefox en este equipo. La conexión no se activó.',
    sandbox_disabled_by_environment:'Una variable del equipo desactiva el aislamiento de Firefox. La conexión no se activó.',
    already_running:'Detén el proceso del bot antes de conectar esta sesión.',
    sign_in_required:'Falta iniciar sesión en la ventana de Facebook.',
    page_identity_changed:'La cuenta abierta no coincide con Scala Fe. No se activaron envíos.',
    post_owner_changed:'No se pudo verificar la publicación de Scala Fe.',
    selectors_not_calibrated:'Facebook muestra controles distintos a los verificados. No se activaron envíos.'};
  const details={notification_view_changed:'No se pudo verificar la pantalla de avisos.',unreliable_timestamp:'Facebook mostró una fecha distinta del formato esperado.',comment_identity_unknown:'No se pudo identificar el enlace del comentario.',comment_author_unknown:'No se pudo verificar el autor del comentario.',replies_not_loaded:'Facebook no terminó de cargar las respuestas.',non_root_linux_required:'Ejecuta la conexión como farm, sin sudo.'};
  console.log(messages[error.message] || details[error.message] || 'No se completó la conexión. La configuración de envíos no se modificó.');
  // Only known codes or the exception class, never raw browser errors/URLs,
  // cookies, usernames, credentials or session values.
  const known=[...Object.keys(messages),...Object.keys(details)];
  console.log('SCALA_ETAPA_FALLIDA: '+stage);
  console.log('SCALA_ERROR_CONEXION: '+(known.includes(error.message)?error.message:({TimeoutError:'tiempo_de_espera_agotado',TypeError:'tipo_de_dato_inesperado',Error:'error_no_clasificado'}[error.name] || 'error_no_clasificado')));
  process.exitCode=78;
}finally{
  clearInterval(renew);terminal?.close();
  if(context){try{await context.close();}catch{}}
  if(store){try{store.releaseRunner(lease);}catch{}store.close();}
}
