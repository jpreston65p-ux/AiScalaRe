const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { context } = require('./dom.cjs');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(process.env.SCALA_TEST_HTML || path.join(root, 'index.html'), 'utf8');
const backend = 'https://scala-ai-publico.thatfixnova.chatgpt.site';
const token = 'test-visitor-session-not-a-service-key';
const settled = () => new Promise(resolve => setImmediate(resolve));
const state = overrides => ({ app: 'scala-ai-public', version: '3.0.0', provider: 'gemini', configured: true, token, retryAfter: 0, ...overrides });
const answer = () => new Response([
  { type: 'meta', model: 'gemini-test-model' },
  { type: 'delta', text: 'Hola 🌱, ' },
  { type: 'delta', text: 'SCALA AI está conectada.' },
  { type: 'done', finishReason: 'stop' },
].map(event => JSON.stringify(event)).join('\n') + '\n', { headers: { 'Content-Type': 'application/x-ndjson' } });
async function boot(fetch, before = () => {}) {
  const page = context(html, { fetch });
  before(page);
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const source = match[1].match(/src="([^"]+)"/);
    if (source) {
      const local = source[1].split('?')[0].replace(/^\.\//, '');
      page.run(fs.readFileSync(path.join(root, local), 'utf8'));
    } else page.run(match[2]);
  }
  await settled();
  return page;
}

test('the published project subpath resolves its own scripts and styles, with no visitor key form', () => {
  const project = new URL('https://jpreston65p-ux.github.io/AiScalaRe/');
  assert.match(html, /data-api-base="https:\/\/scala-ai-publico\.thatfixnova\.chatgpt\.site"/);
  for (const match of html.matchAll(/(?:src|href)="(\.\/chat\/[^"]+)"/g)) {
    const url = new URL(match[1], project);
    assert.ok(url.pathname.startsWith('/AiScalaRe/chat/'));
    assert.ok(fs.existsSync(path.join(root, match[1].split('?')[0])));
  }
  const css = fs.readFileSync(path.join(root, 'chat/original.css'), 'utf8');
  for (const match of css.matchAll(/url\('([^']+)'\)/g)) {
    if (match[1].endsWith('.woff2')) {
      const font = new URL(match[1], new URL('chat/original.css', project));
      assert.equal(font.origin, project.origin);
      assert.ok(font.pathname.startsWith('/AiScalaRe/chat/assets/'));
      assert.ok(fs.existsSync(path.join(root, 'chat', match[1])));
    } else assert.ok(match[1].startsWith(backend + '/chat/assets/'));
  }
  assert.ok(!/api-key|api_key|api-config|SCALA_AI_CONFIG|localhost|127\.0\.0\.1/i.test(html));
});

test('a service without Gemini configured prevents sending and asks visitors for no credentials', async () => {
  const calls = [];
  const page = await boot(async (url, options) => {
    calls.push({ url, options });
    assert.equal(url, backend + '/api/status');
    return Response.json(state({ configured: false }));
  });
  assert.equal(page.get('send').disabled, true);
  assert.match(page.get('connection-note').textContent, /preparando/);
  page.get('message-input').value = 'Hola';
  await page.get('composer').emit('submit');
  assert.equal(calls.length, 1);
  assert.equal(page.get('messages').children.length, 0);
});

test('the real page client gets a visitor session, sends to the public API and renders streamed answers', async () => {
  const calls = [];
  const page = await boot(async (url, options) => {
    calls.push({ url, options });
    if (url === backend + '/api/status') return Response.json(state());
    assert.equal(url, backend + '/api/chat');
    assert.equal(options.headers['X-SCALA-Token'], token);
    assert.equal(options.headers['x-goog-api-key'], undefined);
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body).messages, [{ role: 'user', content: 'Hola SCALA' }]);
    return answer();
  });
  assert.equal(page.get('send').disabled, false);
  page.get('message-input').value = 'Hola SCALA';
  await page.get('composer').emit('submit');
  assert.equal(calls.length, 2);
  assert.match(page.get('messages').textContent, /Hola 🌱, SCALA AI está conectada\./);
  const chats = JSON.parse(page.storage.get('scala-ai-conversations-v1'));
  assert.equal(chats[0].messages[1].content, 'Hola 🌱, SCALA AI está conectada.');
  assert.equal(chats[0].messages[1].partial, false);
  assert.equal(page.get('send').disabled, false);
});

test('an incompatible server version blocks submission with an actionable error', async () => {
  const page = await boot(async () => Response.json(state({ version: '2.2.0', app: 'scala-ai-local' })));
  assert.equal(page.get('send').disabled, true);
  assert.match(page.get('connection-note').textContent, /Recarga/);
});

test('the upgrade preserves current-day messages stored by the old page on the same GitHub origin', async () => {
  const page = await boot(async () => Response.json(state()), page => {
    page.storage.set('scala-ai-conversations-v1', JSON.stringify([{ id: 'old-conversation', updatedAt: new Date().toISOString(), messages: [{ role: 'user', content: 'Mi conversación anterior' }] }]));
  });
  assert.equal(page.get('history-list').children.length, 1);
  assert.match(page.get('history-list').textContent, /Mi conversación anterior/);
});

function useClock(page, date) {
  page.run(`const OriginalDate = Date; let historyTestNow = ${date.getTime()}; Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : [historyTestNow])); } static now() { return historyTestNow; } };`);
  return next => page.run(`historyTestNow = ${next.getTime()};`);
}
const historyKey = 'scala-ai-conversations-v1', activeKey = 'scala-ai-active-v2';
const conversation = (id, date) => ({ id, title: id, updatedAt: date?.toISOString(), messages: [{ role: 'user', content: 'Mensaje ' + id }] });

test('opening the page erases expired, undated and invalid chats while preserving today and explicit preferences', async () => {
  const today = new Date(2026, 9, 15, 12), yesterday = new Date(2026, 9, 14, 23, 59);
  const page = await boot(async () => Response.json(state()), p => {
    useClock(p, today);
    const messageDated = conversation('message-dated'); messageDated.messages[0].savedAt = today.toISOString();
    const continuedOldChat = conversation('started-yesterday', today); continuedOldChat.messages[0].savedAt = yesterday.toISOString();
    p.storage.set(historyKey, JSON.stringify([conversation('today', today), conversation('yesterday', yesterday), conversation('undated'), { ...conversation('invalid'), updatedAt: 'not-a-date' }, messageDated, continuedOldChat]));
    p.storage.set(activeKey, JSON.stringify('yesterday'));
    p.storage.set('scala-ai-preferences-v1', JSON.stringify({ style: 'brief' }));
    p.storage.set('scala-ai-library-v1', JSON.stringify([{ id: 'saved', content: 'Respuesta guardada manualmente' }]));
  });
  assert.deepEqual(JSON.parse(page.storage.get(historyKey)).map(c => c.id), ['today', 'message-dated']);
  assert.equal(JSON.parse(page.storage.get(activeKey)), null);
  assert.ok(!page.get('history-list').textContent.includes('yesterday'));
  assert.equal(JSON.parse(page.storage.get('scala-ai-preferences-v1')).style, 'brief');
  assert.equal(JSON.parse(page.storage.get('scala-ai-library-v1'))[0].id, 'saved');
});

test('an open page clears the active conversation and persisted messages at local midnight', async () => {
  let advance;
  const beforeMidnight = new Date(2026, 9, 15, 23, 59, 59);
  const page = await boot(async () => Response.json(state()), p => {
    advance = useClock(p, beforeMidnight);
    p.storage.set(historyKey, JSON.stringify([conversation('expires-tonight', beforeMidnight)]));
    p.storage.set(activeKey, JSON.stringify('expires-tonight'));
  });
  assert.match(page.get('messages').textContent, /expires-tonight/);
  advance(new Date(2026, 9, 16, 0, 0, 1));
  await page.tick(1100);
  assert.deepEqual(JSON.parse(page.storage.get(historyKey)), []);
  assert.equal(JSON.parse(page.storage.get(activeKey)), null);
  assert.equal(page.get('messages').children.length, 0);
  assert.equal(page.get('history-list').children.length, 0);
});

test('a suspended tab cleans up on resume and a new message starts a fresh conversation', async () => {
  let advance;
  const today = new Date(2026, 9, 15, 12);
  const calls = [];
  const page = await boot(async (url, options) => {
    if (url.endsWith('/api/status')) return Response.json(state());
    calls.push(JSON.parse(options.body)); return answer();
  }, p => {
    advance = useClock(p, today);
    p.storage.set(historyKey, JSON.stringify([conversation('yesterday-after-sleep', today)]));
    p.storage.set(activeKey, JSON.stringify('yesterday-after-sleep'));
  });
  advance(new Date(2026, 9, 16, 12));
  await page.win.emit('focus');
  assert.deepEqual(JSON.parse(page.storage.get(historyKey)), []);
  page.get('message-input').value = 'Mi mensaje de hoy';
  await page.get('composer').emit('submit');
  assert.deepEqual(calls[0].messages, [{ role: 'user', content: 'Mi mensaje de hoy' }]);
  assert.equal(JSON.parse(page.storage.get(historyKey)).length, 1);
});

test('an old backup cannot restore expired or undated chats and a current backup still imports', async () => {
  const today = new Date(2026, 9, 15, 12), yesterday = new Date(2026, 9, 14, 12);
  const page = await boot(async () => Response.json(state()), p => useClock(p, today));
  const importFile = conversations => ({ target: { files: [{ size: 1000, text: async () => JSON.stringify({ conversations }) }], value: 'backup.json' } });
  await page.get('import-file').emit('change', importFile([conversation('expired-copy', yesterday), conversation('undated-copy')]));
  assert.deepEqual(JSON.parse(page.storage.get(historyKey)), []);
  assert.match(page.get('toast').textContent, /no contiene conversaciones de hoy/);
  await page.get('import-file').emit('change', importFile([conversation('current-copy', today)]));
  assert.equal(JSON.parse(page.storage.get(historyKey))[0].id, 'current-copy');
});

test('midnight cancels an in-flight answer without allowing it to recreate deleted history', async () => {
  let advance, streamController, requestSignal, cancelled = 0;
  const beforeMidnight = new Date(2026, 9, 15, 23, 59, 59);
  const page = await boot(async (url, options) => {
    if (url.endsWith('/api/status')) return Response.json(state());
    if (url.endsWith('/api/cancel')) { cancelled++; return Response.json({ cancelled: true }); }
    requestSignal = options.signal;
    return new Response(new ReadableStream({ start(controller) { streamController = controller; options.signal.addEventListener('abort', () => controller.error(new DOMException('Stopped', 'AbortError')), { once: true }); } }));
  }, p => { advance = useClock(p, beforeMidnight); });
  page.get('message-input').value = 'Una respuesta que cruza medianoche';
  const sending = page.get('composer').emit('submit'); await settled();
  assert.ok(streamController);
  advance(new Date(2026, 9, 16, 0, 0, 1));
  await page.tick(1100); await sending;
  assert.equal(requestSignal.aborted, true);
  assert.equal(cancelled, 1);
  assert.deepEqual(JSON.parse(page.storage.get(historyKey)), []);
  assert.equal(page.get('messages').children.length, 0);
});
