import { createInterface } from 'node:readline/promises';
import { loadConfig } from '../src/config.mjs';
import { requireCloudVolume } from '../src/cloud.mjs';
import { normalize } from '../src/catalog.mjs';
import { Store } from '../src/store.mjs';

// Owner-only console operation. Incoming WhatsApp messages cannot call it.
process.umask(0o077);
let terminal, store;
try {
  if (process.argv.length !== 2 || !process.stdin.isTTY || !process.stdout.isTTY) throw new Error('private_terminal_required');
  const config = loadConfig(); requireCloudVolume(config.dataDir);
  terminal = createInterface({ input: process.stdin, output: process.stdout });
  const number = (await terminal.question('Número del cliente con código de país: ')).replace(/[+ ()-]/g, '');
  if (!/^\d{7,15}$/.test(number)) throw new Error('unknown_customer');
  store = new Store(config.dataDir);
  const [peer] = store.knownPeers([number + '@s.whatsapp.net']);
  if (!peer || !store.db.prepare('SELECT id FROM contacts WHERE id=?').get(peer)) throw new Error('unknown_customer');
  for (const product of config.catalog.products) process.stdout.write(`${product.id}: ${product.title}\n`);
  const product = (await terminal.question('ID del producto comprado: ')).trim();
  if (!config.catalog.products.some(p => p.id === product)) throw new Error('unknown_product');
  const payment = await terminal.question('¿Verificaste realmente el pago como integrante autorizado de SCALA? Escribe CONFIRMAR PAGO: ');
  if (normalize(payment) !== 'confirmar pago') throw new Error('not_confirmed');
  const authorize = normalize(await terminal.question('¿Autorizas entregar este producto a este cliente? Escribe AUTORIZAR ENTREGA o pulsa Enter para dejarla pendiente: ')) === 'autorizar entrega';
  const downloadUrl = authorize ? (await terminal.question('Enlace HTTPS real de descarga (Enter si todavía falta): ')).trim() || null : null;
  store.setTrustedOrder(peer, product, { paymentConfirmed: true, deliveryAuthorized: authorize, downloadUrl });
  process.stdout.write(authorize && downloadUrl ? 'Pago verificado y descarga autorizada. El bot podrá incluir este enlace cuando el cliente solicite la entrega o consulte su pago. No se ha enviado ningún mensaje.\n' : 'Pago verificado. La entrega continúa pendiente; no se ha enviado ningún mensaje.\n');
} catch (error) {
  const explanations = {
    private_terminal_required: 'Ejecuta sin argumentos en la consola web privada del servicio de SCALA en Railway.',
    missing_cloud_volume: 'Falta el volumen persistente configurado. No se guardó ninguna aprobación.',
    unknown_customer: 'El bot no reconoce ese número. Pide al cliente que escriba primero; no se guardó ninguna aprobación.',
    unknown_product: 'Ese producto no existe en el catálogo confirmado. No se guardó ninguna aprobación.',
    not_confirmed: 'Operación cancelada. No se confirmó el pago ni se autorizó la entrega.',
    invalid_download_url: 'El enlace debe ser HTTPS, real y sin marcadores de configuración. No se guardó ninguna aprobación.',
  };
  process.stdout.write((explanations[error?.message] || 'No se pudo guardar la aprobación. Revisa la configuración y los permisos del servicio.') + '\n');
  process.exitCode = 1;
} finally { terminal?.close(); store?.close(); }
