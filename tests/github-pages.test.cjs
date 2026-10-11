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

test('the upgrade preserves messages stored by the old page on the same GitHub origin', async () => {
  const page = await boot(async () => Response.json(state()), page => {
    page.storage.set('scala-ai-conversations-v1', JSON.stringify([{ id: 'old-conversation', messages: [{ role: 'user', content: 'Mi conversación anterior' }] }]));
  });
  assert.equal(page.get('history-list').children.length, 1);
  assert.match(page.get('history-list').textContent, /Mi conversación anterior/);
});
