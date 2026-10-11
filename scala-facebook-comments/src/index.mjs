import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { loadConfig } from './config.mjs';
import { Store } from './store.mjs';
import { FacebookProcessor } from './processor.mjs';

process.umask(0o077);
let context, store, lease, renew, stopping = false;
process.once('SIGINT', () => { stopping = true; });
process.once('SIGTERM', () => { stopping = true; });
try {
  // Refuse unverified configurations before loading a browser or creating data.
  const { config, catalog, dataDir } = loadConfig();
  mkdirSync(dataDir, { recursive: true, mode: 0o700 }); chmodSync(dataDir, 0o700);
  store = new Store(dataDir); lease = randomBytes(16).toString('hex'); store.acquireRunner(lease);
  renew = setInterval(() => { try { store.renewRunner(lease); } catch { stopping = true; } }, 5000);
  const { chromium } = await import('playwright');
  const { FacebookBrowser } = await import('./browser.mjs');
  const profile = join(dataDir, 'browser'); mkdirSync(profile, { recursive: true, mode: 0o700 }); chmodSync(profile, 0o700);
  context = await chromium.launchPersistentContext(profile, { headless: false, chromiumSandbox: true, acceptDownloads: false });
  const page = context.pages()[0] || await context.newPage();
  await page.goto(config.inboxUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const connector = new FacebookBrowser(page, config);
  const processor = new FacebookProcessor({ store, catalog, dailyLimit: config.dailyLimit, send: (...args) => connector.send(...args), log: event => console.log(`[${new Date().toISOString()}] ${event}`) });
  await connector.guard();
  // Existing visible threads are baselined before any reply is permitted.
  for (const thread of await connector.threads()) { await connector.open(thread); processor.baseline(await connector.messages()); }
  console.log('Bandeja autorizada abierta. Solo se procesarán mensajes nuevos.');
  while (!stopping) {
    for (const thread of await connector.threads()) {
      if (stopping) break;
      await connector.open(thread);
      for (const event of await connector.messages()) await processor.handle(event);
    }
    store.cleanup();
    if (!stopping) await new Promise(resolve => setTimeout(resolve, config.pollSeconds * 1000));
  }
  await processor.drain();
} catch (error) {
  const explanations = {
    page_not_verified: 'La página de SCALA aún no está conectada ni verificada. El bot no ha abierto Facebook ni activado envíos.',
    sending_not_enabled: 'Los envíos siguen desactivados. Primero hay que validar la conexión y una conversación de prueba.',
    selectors_not_calibrated: 'Falta verificar los controles de la bandeja real. No se ha confirmado esta conexión.',
    sign_in_required: 'Esta sesión necesita acceso autorizado a Facebook. El programa se detuvo; no introduce contraseñas ni resuelve verificaciones.',
    page_identity_changed: 'No se pudo verificar que la bandeja corresponda a la página autorizada. Atención detenida.',
    thread_changed: 'Cambió la conversación activa. Atención detenida para evitar responder a otro destinatario.',
    message_direction_unknown: 'No se puede distinguir con seguridad al cliente del remitente de la página. Atención detenida.',
    unreliable_timestamp: 'No se puede verificar la fecha de los mensajes. Atención detenida para no responder al historial.',
    already_running: 'Ya hay otro proceso utilizando esta instancia del bot.',
  };
  console.log(explanations[error.message] || 'No se pudo completar la conexión de la bandeja. El bot se detuvo; revisa la configuración privada.');
  process.exitCode = 78;
} finally {
  clearInterval(renew);
  if (context) { try { await context.close(); } catch {} }
  if (store) { try { store.releaseRunner(lease); } catch {} store.close(); }
}
