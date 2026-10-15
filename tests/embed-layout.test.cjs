const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../chat/embed-layout.js'), 'utf8');

function boot(search = '', embedded = true) {
  const properties = new Map();
  const root = { dataset: {}, style: { setProperty: (key, value) => properties.set(key, value) } };
  const handlers = new Map();
  const sent = [];
  const parent = { postMessage: (data, origin) => sent.push({ data, origin }) };
  const window = { parent, location: { search }, innerHeight: 900, addEventListener: (name, callback) => handlers.set(name, callback) };
  if (!embedded) window.parent = window;
  vm.runInNewContext(script, { window, document: { documentElement: root }, URLSearchParams });
  return { window, root, properties, parent, handlers, sent };
}

test('normal and standalone chats keep their original layout', () => {
  for (const page of [boot(), boot('?embed=scala&navHeight=130', false)]) {
    assert.equal(page.root.dataset.scalaEmbed, undefined);
    assert.equal(page.properties.size, 0);
    assert.equal(page.handlers.size, 0);
    assert.equal(page.sent.length, 0);
  }
});

test('embedded chat reserves controls inside its own full-page surfaces', () => {
  const page = boot('?embed=scala&navHeight=130');
  assert.equal(page.root.dataset.scalaEmbed, 'true');
  assert.equal(page.properties.get('--scala-nav-height'), '130px');
  assert.equal(page.root.dataset.scalaEmbedCompact, 'false');
  assert.equal(page.sent.length, 1);
  assert.equal(page.sent[0].data.type, 'scala:embed-ready');
  assert.deepEqual(Object.keys(page.sent[0].data), ['type']);
});

test('only the embedding parent can update navigation height', () => {
  const page = boot('?embed=scala&navHeight=130');
  const message = page.handlers.get('message');
  message({ source: {}, data: { type: 'scala:nav-layout', height: 266 } });
  message({ source: page.parent, data: { type: 'unrelated', height: 266 } });
  message({ source: page.parent, data: { type: 'scala:nav-layout', height: '266' } });
  message({ source: page.parent, data: { type: 'scala:nav-layout', height: NaN } });
  assert.equal(page.properties.get('--scala-nav-height'), '130px');
  message({ source: page.parent, data: { type: 'scala:nav-layout', height: 266 } });
  assert.equal(page.properties.get('--scala-nav-height'), '266px');
  assert.equal(page.root.dataset.scalaEmbedCompact, 'true');
  page.window.innerHeight = 1100;
  page.handlers.get('resize')();
  assert.equal(page.root.dataset.scalaEmbedCompact, 'false');
});

test('invalid height input is bounded and cannot create a negative layout', () => {
  const page = boot('?embed=scala&navHeight=-20');
  assert.equal(page.properties.get('--scala-nav-height'), '0px');
  page.handlers.get('message')({ source: page.parent, data: { type: 'scala:nav-layout', height: 90000 } });
  assert.equal(page.properties.get('--scala-nav-height'), '800px');
});
