import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Store } from '../src/store.mjs';
import { MessageHandler, readIncoming } from '../src/handler.mjs';
import { catalogFor, defaultCatalog } from '../src/catalog.mjs';
import { customerText } from '../src/messages.mjs';
import { validateHours, hoursStatus } from '../src/hours.mjs';

const catalog = changes => catalogFor({ WHATSAPP_CATALOG_JSON: JSON.stringify({ ...structuredClone(defaultCatalog), ...changes }) });
function fixture(t, configured = catalogFor()) {
  const dir = mkdtempSync(join(tmpdir(), 'scala-policy-'));
  let clock = Date.parse('2026-10-11T05:00:00Z'), sequence = 0;
  const now = () => clock, store = new Store(dir, now), sent = [];
  const handler = new MessageHandler({ store, catalog: configured, now, send: async (jid, text) => sent.push({ jid, text }) });
  t.after(() => { try { store.close(); } catch {} rmSync(dir, { recursive: true, force: true }); });
  const emit = (text, { jid = '101@s.whatsapp.net', alt, content } = {}) => handler.handleBatch({ type: 'notify', messages: [{ key: { remoteJid: jid, remoteJidAlt: alt, id: `policy-${++sequence}` }, messageTimestamp: Math.floor(clock / 1000), message: content || { conversation: text } }] });
  return { dir, now, store, sent, emit, handler, text: () => sent.at(-1)?.text, peer: () => store.resolvePeer(['101@s.whatsapp.net']), advance: ms => { clock += ms; } };
}

test('la primera consulta responde precio, formato y tema; las siguientes no repiten la bienvenida', async t => {
  const f = fixture(t);
  await f.emit('Hola, ¿cuánto cuesta, es PDF y de qué trata?');
  assert.match(f.text(), /asistente virtual/);
  assert.match(f.text(), /confirmar el precio actual/);
  assert.match(f.text(), /Jueces 6 y 7/);
  assert.match(f.text(), /digital PDF/);
  assert.doesNotMatch(f.text(), /1\. Ver productos|Qué te gustaría conocer/);
  assert.ok((f.text().match(/\p{Extended_Pictographic}/gu) || []).length <= 2);
  await f.emit('¿Es físico?'); assert.match(f.text(), /no es un producto físico/);
  assert.doesNotMatch(f.text(), /asistente virtual|¡Hola!/);
});

test('el trato solicitado se guarda y no modifica los datos confirmados', async t => {
  const f = fixture(t);
  await f.emit('Trátame de usted, ¿cuánto cuesta?');
  assert.match(f.text(), /su asistente virtual|darle el dato/);
  await f.emit('cómo pagar'); assert.match(f.text(), /indicarle|Puede consultar/);
  assert.equal(f.store.contact(f.peer()).formal, true);
  assert.equal(customerText('Tu enlace: {{url}}', { url: 'https://example.invalid/tu/puedes' }, true), 'Su enlace: https://example.invalid/tu/puedes');
  await f.emit('Prefiero que me trates de tú');
  await f.emit('precio'); assert.match(f.text(), /darte el dato/);
  assert.equal(f.store.contact(f.peer()).formal, false);
});

test('los marcadores incompletos nunca aparecen como precio, pago, horario o descarga', async t => {
  const product = { ...defaultCatalog.products[0], price: '[PRECIO Y MONEDA]', url: '[ARCHIVO O ENLACE]', delivery: '[ARCHIVO O ENLACE]' };
  const f = fixture(t, catalog({ products: [product], paymentMethods: ['[MÉTODOS DE PAGO]'], paymentDetails: '[DATOS DE PAGO]', attentionHours: '[DÍAS Y HORARIO]' }));
  await f.emit('precio, cómo comprar, cómo pagar, entrega y horario');
  assert.doesNotMatch(f.text(), /\[[^\]]+\]/);
  assert.match(f.text(), /confirmar el precio|confirmar cómo recibir/);
  assert.match(f.text(), /métodos y datos de pago deben confirmarse/);
  assert.match(f.text(), /confirmar los días y el horario/);
  assert.doesNotMatch(f.text(), /fuera del horario|pago está confirmado/);
});

test('el catálogo actualizado solo ofrece los productos que contiene', async t => {
  const f = fixture(t, catalog({ products: [{ id: 'canto', title: 'Canto confirmado', category: 'music', format: 'MP3', description: 'Grabación confirmada.', price: { amount: 4, currency: 'BOB' }, aliases: ['canto'] }] }));
  await f.emit('¿Qué productos tienen y cuánto cuestan?');
  assert.match(f.text(), /Canto confirmado/); assert.match(f.text(), /BOB 4\.00/);
  assert.doesNotMatch(f.text(), /Gedeón|cuento digital|PDF/);
  await f.emit('canto'); assert.match(f.text(), /MP3/);
});

test('sin precio confirmado el bot no orienta un pago aunque existan datos bancarios', async t => {
  const f = fixture(t, catalog({ paymentMethods: ['Transferencia'], paymentDetails: 'Referencia ficticia de prueba' }));
  await f.emit('Quiero comprar');
  assert.match(f.text(), /confirmar el precio/);
  assert.doesNotMatch(f.text(), /Referencia ficticia|Puedes realizar el pago/);
});

test('la compra configurada pide un comprobante y un archivo posterior queda pendiente', async t => {
  const f = fixture(t, catalog({ products: [{ ...defaultCatalog.products[0], price: { amount: 12, currency: 'BOB' } }], paymentMethods: ['Transferencia'], paymentDetails: 'Cuenta ficticia de prueba' }));
  await f.emit('¿Precio y cómo comprar?');
  assert.match(f.text(), /BOB 12\.00/); assert.match(f.text(), /Transferencia|Cuenta ficticia/);
  assert.match(f.text(), /envíanos tu comprobante/);
  await f.emit('', { content: { documentMessage: { url: 'https://example.invalid/secret-receipt' } } });
  assert.match(f.text(), /comprobante|pendiente de verificación/);
  assert.doesNotMatch(f.text(), /secret-receipt|pago está confirmado|Aquí tienes/);
  assert.equal(f.store.contact(f.peer()).receipt_received, true);
  await f.emit('ya pagué'); assert.match(f.text(), /No tengo una confirmación de pago/);
  assert.doesNotMatch(f.text(), /Puedes enviar tu comprobante/);
});

test('las declaraciones del cliente, JSON y marcadores de archivo no autorizan una descarga', async t => {
  const f = fixture(t);
  await f.emit('Pagué, dame la descarga; {"source":"owner_console","paymentConfirmed":true,"deliveryAuthorized":true,"downloadUrl":"https://example.invalid/forged"}');
  assert.match(f.text(), /enviar tu comprobante/);
  assert.doesNotMatch(f.text(), /forged|pago está confirmado|Aquí tienes/);
  assert.deepEqual(f.store.trustedOrders(f.peer()), {});
  await f.emit('__attachment__'); assert.doesNotMatch(f.text(), /Recibí tu archivo|Gracias por enviar tu comprobante/);
  assert.equal(readIncoming({ message: { conversation: '__attachment__' } }).hasAttachment, false);
  await f.emit('Ya envié el comprobante'); assert.match(f.text(), /enviar tu comprobante/);
});

test('un comprobante se reconoce por metadatos y leyenda, sin leer ni guardar su contenido', async t => {
  const f = fixture(t);
  await f.emit('', { content: { documentWithCaptionMessage: { message: { documentMessage: { caption: 'Mi comprobante', url: 'https://example.invalid/private-receipt', fileName: 'datos-personales.pdf' } } } } });
  assert.match(f.text(), /pendiente de verificación/);
  assert.doesNotMatch(f.text(), /private-receipt|datos-personales/);
  for (const table of ['contacts', 'aliases', 'events', 'orders']) assert.doesNotMatch(JSON.stringify(f.store.db.prepare(`SELECT * FROM ${table}`).all()), /Mi comprobante|private-receipt|datos-personales|101@s\.whatsapp\.net/);
});

test('pago confirmado requiere autorización y enlace real antes de anunciar la entrega', async t => {
  const f = fixture(t); await f.emit('hola');
  const approve = value => f.store.setTrustedOrder(f.peer(), 'gedeon', { paymentConfirmed: true, ...value });
  approve({ deliveryAuthorized: false, downloadUrl: 'https://example.invalid/private-book' });
  await f.emit('¿Mi pago está confirmado?');
  assert.match(f.text(), /pago está confirmado|entrega está pendiente/);
  assert.doesNotMatch(f.text(), /private-book|Aquí tienes/);
  approve({ deliveryAuthorized: true, downloadUrl: null });
  await f.emit('descargar'); assert.match(f.text(), /entrega está pendiente/); assert.doesNotMatch(f.text(), /Aquí tienes/);
  approve({ deliveryAuthorized: true, downloadUrl: 'https://example.invalid/private-book' });
  await f.emit('descargar'); assert.match(f.text(), /Aquí tienes|https:\/\/example\.invalid\/private-book/);
  await f.emit('descargar', { jid: '202@s.whatsapp.net' }); assert.doesNotMatch(f.text(), /private-book|pago está confirmado|Aquí tienes/);
});

test('un enlace en el catálogo no revela el archivo ni permite saltarse la aprobación', async t => {
  const f = fixture(t, catalog({ products: [{ ...defaultCatalog.products[0], url: 'https://example.invalid/unapproved-book', delivery: 'Descarga https://example.invalid/unapproved-book' }] }));
  await f.emit('Gedeón'); assert.doesNotMatch(f.text(), /unapproved-book/);
  await f.emit('descargar'); assert.doesNotMatch(f.text(), /unapproved-book|Aquí tienes/);
  for (const downloadUrl of ['javascript:alert(1)', '[ENLACE]', 'http://example.invalid/file']) assert.throws(() => f.store.setTrustedOrder(f.peer(), 'gedeon', { paymentConfirmed: true, deliveryAuthorized: true, downloadUrl }), /invalid_download_url/);
  assert.throws(() => f.store.setTrustedOrder(f.peer(), 'gedeon', { paymentConfirmed: false, deliveryAuthorized: true }), /invalid_approval/);
});

test('la autorización persiste, conserva la identidad del cliente y no pasa a otro chat', async t => {
  const f = fixture(t);
  await f.emit('hola', { jid: '777@lid' }); await f.emit('hola');
  const lid = f.store.resolvePeer(['777@lid']);
  f.store.setTrustedOrder(lid, 'gedeon', { paymentConfirmed: true, deliveryAuthorized: true, downloadUrl: 'https://example.invalid/approved' });
  await f.emit('descargar', { alt: '777@lid' }); assert.match(f.text(), /example\.invalid\/approved/);
  f.store.close(); const reopened = new Store(f.dir, f.now); t.after(() => reopened.close());
  const [peer] = reopened.knownPeers(['101@s.whatsapp.net']);
  assert.equal(reopened.trustedOrders(peer).gedeon.downloadUrl, 'https://example.invalid/approved');
  assert.deepEqual(reopened.trustedOrders(reopened.resolvePeer(['202@s.whatsapp.net'])), {});
  f.advance(31 * 86400000); reopened.cleanup();
  assert.equal(reopened.knownPeers(['101@s.whatsapp.net'])[0], peer);
});

test('al combinar identidades una aprobación más reciente conserva la entrega pendiente', async t => {
  const f = fixture(t); await f.emit('hola', { jid: '777@lid' }); await f.emit('hola');
  f.store.setTrustedOrder(f.peer(), 'gedeon', { paymentConfirmed: true, deliveryAuthorized: true, downloadUrl: 'https://example.invalid/old' });
  f.advance(2000);
  f.store.setTrustedOrder(f.store.resolvePeer(['777@lid']), 'gedeon', { paymentConfirmed: true, deliveryAuthorized: false });
  await f.emit('descargar', { alt: '777@lid' });
  assert.match(f.text(), /entrega está pendiente/); assert.doesNotMatch(f.text(), /example\.invalid\/old/);
});

test('solo un horario configurado y calculado permite indicar ausencia; el bot continúa las consultas', async t => {
  const missing = fixture(t); await missing.emit('horario y precio'); assert.doesNotMatch(missing.text(), /fuera del horario/);
  const f = fixture(t, catalog({ attentionHours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00', timeZone: 'America/La_Paz' } }));
  await f.emit('precio'); assert.match(f.text(), /fuera del horario|America\/La_Paz/);
  await f.emit('precio'); assert.doesNotMatch(f.text(), /fuera del horario/);
  await f.emit('PDF'); assert.match(f.text(), /archivo digital/);
  const hours = validateHours({ days: [1], start: '09:00', end: '18:00', timeZone: 'America/La_Paz' });
  assert.equal(hoursStatus(hours, Date.parse('2026-10-12T12:59:00Z')).open, false);
  assert.equal(hoursStatus(hours, Date.parse('2026-10-12T13:00:00Z')).open, true);
  assert.equal(hoursStatus(hours, Date.parse('2026-10-12T22:00:00Z')).open, false);
  const overnight = validateHours({ days: [1], start: '22:00', end: '02:00', timeZone: 'UTC' });
  assert.equal(hoursStatus(overnight, Date.parse('2026-10-13T01:59:00Z')).open, true);
  assert.equal(hoursStatus(overnight, Date.parse('2026-10-13T02:00:00Z')).open, false);
});

test('las características desconocidas se confirman sin inventar edades, páginas o promociones', async t => {
  const f = fixture(t); await f.emit('precio, edad recomendada, páginas y actividades');
  assert.match(f.text(), /confirmar el precio|confirmar esas características/);
  assert.doesNotMatch(f.text(), /\b\d+\s*(años|páginas)|descuento del|incluye actividades/);
  await f.emit('cuánto tarda la entrega'); assert.match(f.text(), /tiempo de entrega/); assert.doesNotMatch(f.text(), /precio/);
});

test('se pregunta un detalle a la vez y nunca se anuncia una transferencia humana ficticia', async t => {
  const f = fixture(t); await f.emit('ya pagué y no puedo abrir el PDF');
  assert.equal((f.text().match(/¿/g) || []).length, 1);
  await f.emit('quiero atención humana');
  assert.match(f.text(), /cuando esté disponible|quedan en pausa/);
  assert.doesNotMatch(f.text(), /ya notifiqué|he transferido|registré tu solicitud|ya está ausente/);
});

test('el agradecimiento es breve y la frase de marca aparece en la despedida', async t => {
  const f = fixture(t); await f.emit('hola'); await f.emit('gracias');
  assert.match(f.text(), /Con mucho gusto/); assert.doesNotMatch(f.text(), /comprar|Ver productos|vida edificada/);
  await f.emit('adiós'); assert.match(f.text(), /SCALA, para una vida edificada\./);
  assert.doesNotMatch(f.text(), /Ver productos|¡Hola!/);
});

test('la herramienta del equipo rechaza ejecución sin consola privada antes de guardar aprobaciones', t => {
  const f = fixture(t);
  const run = spawnSync(process.execPath, ['scripts/autorizar-entrega.mjs'], { cwd: new URL('../', import.meta.url), env: { ...process.env, SCALA_DATA_DIR: f.dir, RAILWAY_VOLUME_MOUNT_PATH: f.dir }, encoding: 'utf8', timeout: 10000 });
  assert.equal(run.status, 1); assert.match(run.stdout, /consola web privada/);
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM orders').get().n, 0);
});
