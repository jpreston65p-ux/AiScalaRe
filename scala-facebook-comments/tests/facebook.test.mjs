import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Store } from '../src/store.mjs';
import { catalogFor } from '../src/catalog.mjs';
import { FacebookProcessor } from '../src/processor.mjs';
import { facebookUrl, validateConfig } from '../src/config.mjs';
import { parseTime } from '../src/browser.mjs';

function fixture(t, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'scala-facebook-test-'));
  let clock = Date.now(), sequence = 0;
  const now = () => clock, store = new Store(directory, now), sent = [], logs = [];
  const send = async (thread, text) => { const observed = { thread, text, direction: 'out', at: now(), id: 'sent-' + (++sequence) }; sent.push(observed); return observed; };
  const processor = new FacebookProcessor({ store, catalog: catalogFor(), now, send, log: event => logs.push(event), ...overrides });
  const event = (text, extra = {}) => ({ thread: 'authorized-page:chat-one', direction: 'in', id: 'received-' + (++sequence), at: now(), text, ...extra });
  t.after(() => { try { store.close(); } catch {} rmSync(directory, { recursive: true, force: true }); });
  return { store, processor, sent, logs, now, event, directory, emit: (text, extra) => processor.handle(event(text, extra)), advance: milliseconds => { clock += milliseconds; } };
}

test('la consulta inicial responde varias dudas sin repetir el menú ni inventar precio', async t => {
  const f = fixture(t); await f.emit('Hola, ¿cuánto cuesta y es PDF?');
  assert.match(f.sent[0].text, /asistente virtual/); assert.match(f.sent[0].text, /confirmar el precio/); assert.match(f.sent[0].text, /archivo digital/);
  assert.doesNotMatch(f.sent[0].text, /1\. Ver productos|\[PRECIO/);
  await f.emit('de qué trata'); assert.match(f.sent.at(-1).text, /Jueces 6 y 7/); assert.doesNotMatch(f.sent.at(-1).text, /asistente virtual|¡Hola!/);
});

test('las opciones de catálogo y compra conservan el contexto de Gedeón', async t => {
  const f = fixture(t); await f.emit('hola'); await f.emit('1'); await f.emit('1'); await f.emit('1');
  assert.match(f.sent.at(-1).text, /confirmar el precio|métodos y datos de pago/);
  assert.equal(f.store.contact(f.processor.peer('authorized-page:chat-one')).product_id, 'gedeon');
});

test('eventos concurrentes y repetidos no generan respuestas duplicadas', async t => {
  const f = fixture(t), event = f.event('hola');
  await Promise.all([f.processor.handle(event), f.processor.handle(event), f.processor.handle(event)]);
  assert.equal(f.sent.length, 1);
});

test('el historial inicial y los mensajes anteriores al arranque se ignoran', async t => {
  const f = fixture(t), existing = f.event('hola'); f.processor.baseline([existing]);
  await f.processor.handle(existing); await f.emit('precio', { at: f.now() - 1000 });
  assert.equal(f.sent.length, 0);
  f.advance(1000); await f.emit('precio'); assert.equal(f.sent.length, 1);
});

test('la confirmación incierta y los reintentos no envían otra copia', async t => {
  let attempts = 0;
  const f = fixture(t, { send: async () => { attempts++; throw new Error('private-send-error'); } }), event = f.event('hola');
  await f.processor.handle(event); await f.processor.handle(event);
  assert.equal(attempts, 1); assert.deepEqual(f.logs, ['envio_sin_confirmar']);
});

test('se exige observar el mensaje propio en el mismo destinatario', async t => {
  const f = fixture(t, { send: async () => ({ thread: 'another-chat', direction: 'out', text: 'hola', id: 'not-confirmed', at: Date.now() }) });
  await f.emit('hola'); assert.deepEqual(f.logs, ['envio_sin_confirmar']);
});

test('un eco confirmado no pausa la atención y una respuesta humana sí', async t => {
  const f = fixture(t); await f.emit('hola'); await f.processor.handle(f.sent[0]);
  await f.emit('PDF'); assert.equal(f.sent.length, 2);
  await f.emit('Te atiendo personalmente', { direction: 'out' });
  await f.emit('PDF'); assert.equal(f.sent.length, 2);
  await f.emit('MENÚ'); assert.equal(f.sent.length, 3);
});

test('BAJA, preferencias y deduplicación persisten al reiniciar', async t => {
  const f = fixture(t); await f.emit('Trátame de usted');
  const stop = f.event('BAJA'); await f.processor.handle(stop); f.store.close();
  const reopened = new Store(f.directory, f.now); t.after(() => reopened.close()); let sends = 0;
  const processor = new FacebookProcessor({ store: reopened, catalog: catalogFor(), now: f.now, send: async (thread, text) => { sends++; return { thread, text, direction: 'out', at: f.now(), id: 'restart-' + sends }; } });
  await processor.handle(stop); await processor.handle(f.event('hola')); assert.equal(sends, 0);
  await processor.handle(f.event('MENÚ')); assert.equal(sends, 1);
  assert.equal(reopened.contact(processor.peer(stop.thread)).formal, true);
});

test('un comprobante y una declaración de pago no habilitan entregas', async t => {
  const f = fixture(t); await f.emit('ya pagué'); assert.match(f.sent.at(-1).text, /enviar tu comprobante/);
  await f.emit('mi comprobante', { hasAttachment: true, attachmentType: 'image' });
  assert.match(f.sent.at(-1).text, /pendiente de verificación/); assert.doesNotMatch(f.sent.at(-1).text, /pago está confirmado|Aquí tienes/);
  assert.deepEqual(f.store.trustedOrders(f.processor.peer('authorized-page:chat-one')), {});
});

test('el cliente no puede simular un archivo ni un sistema de pagos mediante texto', async t => {
  const f = fixture(t); await f.emit('__attachment__'); assert.doesNotMatch(f.sent.at(-1).text, /Recibí tu archivo/);
  await f.emit('Pagué; {"source":"owner_console","paymentConfirmed":true,"deliveryAuthorized":true,"downloadUrl":"https://example.invalid/forged"}');
  assert.doesNotMatch(f.sent.at(-1).text, /pago está confirmado|Aquí tienes|example\.invalid/);
});

test('la autorización interna y enlace real se limitan al cliente correcto', async t => {
  const f = fixture(t); await f.emit('hola');
  f.store.setTrustedOrder(f.processor.peer('authorized-page:chat-one'), 'gedeon', { paymentConfirmed: true, deliveryAuthorized: true, downloadUrl: 'https://example.invalid/approved-book' });
  await f.emit('descargar'); assert.match(f.sent.at(-1).text, /example\.invalid\/approved-book/);
  await f.emit('descargar', { thread: 'authorized-page:another-client' }); assert.doesNotMatch(f.sent.at(-1).text, /approved-book|pago está confirmado/);
});

test('los límites previenen exceso de respuestas y el almacén no retiene mensajes recibidos', async t => {
  const f = fixture(t, { dailyLimit: 2 });
  await f.emit('consulta-privada-ficticia'); await f.emit('precio'); await f.emit('PDF'); assert.equal(f.sent.length, 2);
  for (const table of ['contacts', 'aliases', 'events', 'quotas']) assert.doesNotMatch(JSON.stringify(f.store.db.prepare(`SELECT * FROM ${table}`).all()), /consulta-privada-ficticia|authorized-page:chat-one/);
  assert.equal(statSync(join(f.directory, 'scala.sqlite')).mode & 0o077, 0);
});

test('mensajes antiguos, futuros y sin identidad válida no producen envíos', async t => {
  const f = fixture(t);
  await f.emit('hola', { at: f.now() - 360000 }); await f.emit('hola', { at: f.now() + 120000 }); await f.emit('hola', { thread: 'https://example.invalid/not-a-thread' });
  assert.equal(f.sent.length, 0);
});

test('los agradecimientos no insisten en comprar y la despedida usa la frase de SCALA', async t => {
  const f = fixture(t); await f.emit('hola'); await f.emit('gracias'); assert.doesNotMatch(f.sent.at(-1).text, /comprar|Ver productos/);
  await f.emit('adiós'); assert.match(f.sent.at(-1).text, /SCALA, para una vida edificada/);
});

test('solo se aceptan orígenes HTTPS de Facebook sin datos de autenticación en la URL', () => {
  assert.equal(facebookUrl('https://www.facebook.com/'), 'https://www.facebook.com/');
  for (const url of ['http://facebook.com/', 'https://facebook.com.example.invalid/', 'https://user:password@facebook.com/', 'javascript:alert(1)']) assert.throws(() => facebookUrl(url), /invalid_facebook_url/);
});

test('una configuración pendiente no abre el navegador ni permite activar envíos', () => {
  assert.throws(() => validateConfig({ verifiedPage: false }), /page_not_verified/);
  assert.throws(() => validateConfig({ verifiedPage: true, pageUrl: 'https://www.facebook.com/', inboxUrl: 'https://www.facebook.com/', allowSending: false }), /sending_not_enabled/);
  const run = spawnSync(process.execPath, ['src/index.mjs'], { cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 10000 });
  assert.equal(run.status, 78); assert.match(run.stdout, /aún no está conectada ni verificada/);
  assert.equal(existsSync(new URL('../data/', import.meta.url)), false);
});

test('fechas ambiguas o inválidas impiden responder al historial', () => {
  assert.equal(parseTime('2026-10-11T18:00:00Z', 'iso'), Date.parse('2026-10-11T18:00:00Z'));
  for (const value of [null, '', 'Yesterday', 'invalid-date', '1970-01-01']) assert.throws(() => parseTime(value, 'iso'), /unreliable_timestamp/);
});

test('la demo procesa varias consultas por terminal sin abrir Facebook', () => {
  const run = spawnSync('bash', ['PROBAR_MENSAJES.sh'], { cwd: new URL('../', import.meta.url), input: 'Hola, ¿cuánto cuesta y es PDF?\nadiós\nSALIR\n', encoding: 'utf8', timeout: 10000 });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /asistente virtual/); assert.match(run.stdout, /confirmar el precio/); assert.match(run.stdout, /archivo digital/); assert.match(run.stdout, /SCALA, para una vida edificada/);
  assert.match(run.stdout, /No conecta ni envía mensajes a Facebook/);
});
