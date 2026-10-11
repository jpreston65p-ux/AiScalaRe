import { mkdirSync, chmodSync, writeFileSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { randomBytes } from 'node:crypto';
import { loadConfig, validateConfig, root, facebookPostUrl } from './config.mjs';
import { fingerprint } from './browser.mjs';
import { FacebookCommentsBrowser } from './comment-browser.mjs';
import { Store } from './store.mjs';

process.umask(0o077);
let context,terminal,store,lease,renew;
try {
  if (!process.stdin.isTTY || !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) throw new Error('desktop_required');
  const loaded=loadConfig({live:false});
  const config=validateConfig({...loaded.config,verifiedPage:true,allowSending:true});
  if (config.mode !== 'comments') throw new Error('comments_not_selected');
  const privateDir=join(loaded.dataDir,'comments'),profile=join(privateDir,'browser');
  mkdirSync(profile,{recursive:true,mode:0o700});chmodSync(privateDir,0o700);chmodSync(profile,0o700);
  store=new Store(privateDir);lease=randomBytes(16).toString('hex');store.acquireRunner(lease);
  renew=setInterval(()=>{try{store.renewRunner(lease);}catch{terminal?.close();void context?.close();}},5000);
  const {chromium}=await import('playwright');
  context=await chromium.launchPersistentContext(profile,{headless:false,chromiumSandbox:true,acceptDownloads:false,timezoneId:config.comments.timeZone,locale:'es-BO'});
  const page=context.pages()[0] || await context.newPage();
  await page.goto('https://www.facebook.com/',{waitUntil:'domcontentloaded',timeout:30000});
  console.log('Inicia sesión en la ventana de Facebook y selecciona Scala Fe. Este paso no publica comentarios.');
  console.log('No escribas tu contraseña ni códigos en la terminal o en el chat.');
  terminal=createInterface({input:process.stdin,output:process.stdout});
  await terminal.question('Cuando veas Scala Fe en el navegador, pulsa Enter para comprobar la conexión: ');
  const connector=new FacebookCommentsBrowser(page,config,loaded.catalog);
  await connector.verifyAccount();
  for (const value of config.comments.postUrls) {
    const url=facebookPostUrl(value,config.comments.ownerId);
    await connector.open({id:fingerprint(url),url});
    await connector.comments();
  }
  const {FacebookCommentNotifications}=await import('./comment-notifications.mjs');
  const notifications=new FacebookCommentNotifications(await context.newPage(),config,store);
  await notifications.open();
  // Do not baseline events here: activation starts with the runner, not login.
  const target=resolve(root,'facebook.config.json'),temporary=target+'.tmp';
  writeFileSync(temporary,JSON.stringify(config,null,2)+'\n',{mode:0o600});renameSync(temporary,target);
  console.log('Sesión del programa y controles comprobados. Inicia con: bash INICIAR_SCALA_FACEBOOK.sh');
  console.log('Una respuesta automática todavía debe verificarse al recibir un comentario nuevo.');
}catch(error){
  const messages={desktop_required:'La conexión inicial necesita la terminal y el escritorio de Linux Mint.',
    already_running:'Detén el proceso del bot antes de conectar esta sesión.',
    sign_in_required:'Falta iniciar sesión en la ventana de Facebook.',
    page_identity_changed:'La cuenta abierta no coincide con Scala Fe. No se activaron envíos.',
    post_owner_changed:'No se pudo verificar la publicación de Scala Fe.',
    selectors_not_calibrated:'Facebook muestra controles distintos a los verificados. No se activaron envíos.'};
  console.log(messages[error.message] || 'No se completó la conexión. La configuración de envíos no se modificó.');
  process.exitCode=78;
}finally{
  clearInterval(renew);terminal?.close();
  if(context){try{await context.close();}catch{}}
  if(store){try{store.releaseRunner(lease);}catch{}store.close();}
}
