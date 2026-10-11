import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { loadConfig } from '../src/config.mjs';
import { hasLinkedCredentials } from '../src/session.mjs';

try {
  const config=loadConfig();
  const file=join(config.dataDir,'scala.sqlite');
  let saved=false,needsQr=true,lastConnected=null,lastReply=null;
  if(existsSync(file)) {
    const db=new DatabaseSync(file,{readOnly:true});
    const row=db.prepare("SELECT value FROM auth WHERE category='credentials' AND id='main'").get();
    saved=!!row && hasLinkedCredentials(JSON.parse(row.value));
    const meta=key=>db.prepare('SELECT value FROM metadata WHERE key=?').get(key)?.value;
    needsQr=!saved || meta('auth_invalid')==='1';
    lastConnected=meta('last_connected_at') || null; lastReply=meta('last_reply_at') || null;
    db.close();
  }
  console.log(JSON.stringify({proyecto:'SCALA WhatsApp QR',node:process.versions.node,productos:config.catalog.products.length,sesionGuardada:saved,necesitaQr:needsQr,ultimoAcceso:lastConnected,ultimaRespuesta:lastReply,basePrivada:!existsSync(file) || (statSync(file).mode & 0o077)===0,nota:'El diagnóstico es local. Una sesión guardada no demuestra conexión actual con WhatsApp.'},null,2));
  if(process.argv.includes('--require-linked') && needsQr) process.exitCode=78;
} catch { console.error('No se pudo revisar la configuración. Comprueba catalogo.json y los permisos de data/.'); process.exitCode=1; }
