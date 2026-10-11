import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { publicCommentReply } from '../src/comments.mjs';
import { FacebookCommentProcessor } from '../src/comment-processor.mjs';
import { Store } from '../src/store.mjs';
import { catalogFor, defaultCatalog } from '../src/catalog.mjs';
import { validateConfig, facebookPostUrl } from '../src/config.mjs';

function fixture(t, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'scala-comments-test-'));
  let clock = Date.now(), sequence = 0;
  const now = () => clock, store = new Store(directory, now), sent = [], logs = [];
  const send = async (event, text) => {
    const observed = { postId: event.postId, parentId: event.id, id: 'reply-' + (++sequence), authorId: 'scala-owner', isOwn: true, at: now(), text };
    sent.push(observed); return observed;
  };
  const processor = new FacebookCommentProcessor({ store, catalog: catalogFor(), ownerId: 'scala-owner', send, now, log: message => logs.push(message), ...overrides });
  processor.baseline('post-one', []);
  const event = (text, extra = {}) => ({ postId: 'post-one', id: 'comment-' + (++sequence), authorId: 'customer-one', isOwn: false, productId:'gedeon', at: now(), text, ...extra });
  t.after(() => { try { store.close(); } catch {} rmSync(directory, { recursive: true, force: true }); });
  return { processor, store, sent, logs, now, event, directory, advance: ms => { clock += ms; } };
}

test('un comentario con varias dudas recibe respuestas públicas con datos confirmados', () => {
  const reply = publicCommentReply('¿Cuánto cuesta y es físico o PDF?', catalogFor());
  assert.match(reply.text, /asistente virtual/);
  assert.match(reply.text, /confirmar el precio/);
  assert.match(reply.text, /digital PDF/);
  assert.doesNotMatch(reply.text, /\[PRECIO|páginas|precio.*\d|te envié|te enviamos|comprobante/);
});

test('los comentarios nunca revelan comprobantes, datos de pago o descargas de clientes', () => {
  const catalog = catalogFor({ WHATSAPP_CATALOG_JSON: JSON.stringify({ ...defaultCatalog,
    products: [{ ...defaultCatalog.products[0], price: { amount: 20, currency: 'BOB' } }],
    paymentMethods: ['QR'], paymentDetails: 'DATOS_BANCARIOS_PRIVADOS', paymentInstructions: 'INSTRUCCION_PRIVADA' }) });
  const reply = publicCommentReply('¿Precio? Ya pagué; envíame mi descarga https://example.invalid/secreto', catalog);
  assert.match(reply.text, /BOB 20\.00/); assert.match(reply.text, /mensaje privado/);
  assert.doesNotMatch(reply.text, /DATOS_BANCARIOS_PRIVADOS|INSTRUCCION_PRIVADA|example\.invalid|pago está confirmado|Aquí tienes|comprobante recibido/);
  assert.doesNotMatch(publicCommentReply('gracias', catalog).text, /comprar|privado|precio/);
});

test('las consultas sobre el cuento conservan su formato y las características desconocidas se confirman', () => {
  const reply = publicCommentReply('Información de Gedeón, ¿cuántas páginas y para qué edad?', catalogFor());
  assert.match(reply.text, /Jueces 6 y 7/); assert.match(reply.text, /digital PDF/);
  assert.match(reply.text, /necesitan confirmación/);
  assert.equal(publicCommentReply('https://example.invalid/anuncio', catalogFor()), null);
});

test('pedir información no se interpreta como compra y los agradecimientos no repiten la venta', () => {
  assert.doesNotMatch(publicCommentReply('Quiero información de Gedeón', catalogFor()).text, /comprar|mensaje privado/);
  assert.doesNotMatch(publicCommentReply('Qué hermoso Gedeón, gracias', catalogFor()).text, /comprar|Formato|Jueces/);
  assert.match(publicCommentReply('¿A qué horario atienden?', catalogFor()).text, /confirmar el horario/);
});

test('solo se responde a comentarios nuevos de una publicación inicializada, una vez por comentario', async t => {
  const f = fixture(t), existing = f.event('precio');
  f.processor.baseline('post-one', [existing]);
  await f.processor.handle(existing);
  await f.processor.handle(f.event('precio', { postId: 'post-not-initialized' }));
  f.advance(1000); const fresh = f.event('¿Es PDF?');
  await Promise.all([f.processor.handle(fresh), f.processor.handle(fresh), f.processor.handle(fresh)]);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].postId, fresh.postId); assert.equal(f.sent[0].parentId, fresh.id);
});

test('SCALA no responde a sus propios comentarios, respuestas anidadas ni hilos atendidos por una persona', async t => {
  const f = fixture(t);
  for (const extra of [{ isOwn: true }, { authorId: 'scala-owner' }, { hasOwnReply: true }, { isReply: true }]) await f.processor.handle(f.event('precio', extra));
  assert.equal(f.sent.length, 0);
});

test('una respuesta observada bajo otro comentario no se da por confirmada', async t => {
  const f = fixture(t, { send: async (event, text) => ({ ...event, authorId: 'scala-owner', isOwn: true, parentId: 'another-comment', id: 'reply-one', text }) });
  const event = f.event('¿precio?'); await f.processor.handle(event);
  assert.equal(f.store.eventState('facebook-comments', f.processor.key(event)), 'uncertain');
  assert.deepEqual(f.logs, ['comentario_sin_confirmar']);
});

test('un envío incierto no se duplica al reintentar ni al reiniciar el proceso', async t => {
  let attempts = 0;
  const send = async () => { attempts++; throw new Error('unconfirmed'); };
  const f = fixture(t, { send }), event = f.event('precio');
  await f.processor.handle(event); await f.processor.handle(event); f.store.close();
  const reopened = new Store(f.directory, f.now); t.after(() => reopened.close());
  const restarted = new FacebookCommentProcessor({ store: reopened, catalog: catalogFor(), ownerId: 'scala-owner', now: f.now, send });
  restarted.baseline('post-one', []); await restarted.handle(event);
  assert.equal(attempts, 1);
});

test('BAJA pausa al autor entre publicaciones sin pausar a otros clientes', async t => {
  const f = fixture(t); await f.processor.handle(f.event('BAJA'));
  f.processor.baseline('post-two', []);
  await f.processor.handle(f.event('precio', { postId: 'post-two' }));
  await f.processor.handle(f.event('precio', { postId: 'post-two', authorId: 'another-customer' }));
  assert.equal(f.sent.length, 2);
  assert.match(f.sent[0].text, /Pausaré/); assert.match(f.sent[1].text, /confirmar el precio/);
});

test('se rechazan comentarios antiguos o futuros y se respeta el límite de respuestas', async t => {
  const f = fixture(t, { dailyLimit: 1 });
  for (const extra of [{ at: f.now() - 60000 }, { at: f.now() + 120000 }, { authorId: 'https://example.invalid' }]) await f.processor.handle(f.event('precio', extra));
  await f.processor.handle(f.event('precio')); await f.processor.handle(f.event('PDF'));
  assert.equal(f.sent.length, 1);
});

test('la configuración inicial de comentarios bloquea los envíos antes de abrir Facebook', () => {
  const run = spawnSync(process.execPath, ['src/entry.mjs'], { cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 10000 });
  assert.equal(run.status, 78); assert.match(run.stdout, /Falta conectar la sesión del programa/);
  assert.equal(existsSync(new URL('../data/', import.meta.url)), false);
  assert.throws(() => validateConfig({ mode: 'comments', verifiedPage: true, allowSending: true, pageUrl: 'https://www.facebook.com/p/Scala-Fe-61576458508649/', comments: { selectors: null } }), /selectors_not_calibrated/);
  assert.equal(facebookPostUrl('https://www.facebook.com/reel/1079349435002481/?tracking=value', '61576458508649'), 'https://www.facebook.com/reel/1079349435002481/');
  for (const url of ['https://www.facebook.com/groups/1/', 'https://example.invalid/post', 'https://www.facebook.com/permalink.php?story_fbid=123&id=another-owner']) assert.throws(() => facebookPostUrl(url, '61576458508649'));
});

test('el primer comentario nuevo en una publicación antigua o recién creada no se pierde por una nueva línea base', async t => {
  const f=fixture(t);
  f.advance(1000);
  await f.processor.handleNotification(f.event('precio',{postId:'old-photo'}));
  await f.processor.handleNotification(f.event('¿Es PDF?',{postId:'brand-new-post'}));
  assert.equal(f.sent.length,2);
  assert.deepEqual(f.sent.map(reply=>reply.postId),['old-photo','brand-new-post']);
});

test('enlaces alternativos de una publicación no duplican un mismo comentario', async t => {
  const f=fixture(t),event=f.event('precio');
  await f.processor.handleNotification(event);
  await f.processor.handleNotification({...event,postId:'another-url-for-same-post'});
  assert.equal(f.sent.length,1);
});

test('un precio en una publicación sin producto confirmado pide identificarlo', () => {
  const reply=publicCommentReply('¿Cuánto cuesta?',catalogFor(),{requireProductContext:true});
  assert.match(reply.text,/De qué producto/i);
  assert.doesNotMatch(reply.text,/Gedeón|cuesta.*\d|BOB/);
});

test('la decoración conserva la identificación virtual y como máximo dos emojis', () => {
  const reply=publicCommentReply('Información, precio y cómo comprar Gedeón',catalogFor());
  assert.match(reply.text,/asistente virtual/);
  assert.match(reply.text,/📖 «Gedeón/);
  assert.match(reply.text,/\n\n/);
  assert.equal((reply.text.match(/[😊💙📖]/gu)||[]).length,2);
});

test('las consultas generales usan el catálogo confirmado y las dudas sin producto piden una sola aclaración',()=>{
  const catalog=publicCommentReply('¿Qué productos tienen?',catalogFor(),{requireProductContext:true});
  assert.match(catalog.text,/Gedeón/);assert.match(catalog.text,/digital PDF/);
  const unclear=publicCommentReply('¿Precio y es PDF?',catalogFor(),{requireProductContext:true});
  assert.equal((unclear.text.match(/¿/g)||[]).length,1);
});

test('la demo de comentarios funciona por terminal sin publicar en Facebook', () => {
  const run = spawnSync('bash', ['PROBAR_COMENTARIOS.sh'], { cwd: new URL('../', import.meta.url), input: '¿Precio y formato PDF?\nGracias\nSALIR\n', encoding: 'utf8', timeout: 10000 });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /No conecta ni publica respuestas en Facebook/);
  assert.match(run.stdout, /confirmar el precio/); assert.match(run.stdout, /digital PDF/);
});
