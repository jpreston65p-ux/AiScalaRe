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
  const frames = [];
  let now = 1000;
  const parent = { postMessage: (data, origin) => sent.push({ data, origin }) };
  const window = { parent, location: { search }, innerHeight: 900, addEventListener: (name, callback) => handlers.set(name, callback), requestAnimationFrame: callback => frames.push(callback) };
  if (!embedded) window.parent = window;
  vm.runInNewContext(script, { window, document: { documentElement: root }, URLSearchParams, Date: { now: () => now } });
  return { window, root, properties, parent, handlers, sent, advance: milliseconds => { now += milliseconds; }, flush: () => { frames.splice(0).forEach(callback => callback()); } };
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

test('workspace scrolling relays user movement once per frame and keeps the complete direction', () => {
  const page = boot('?embed=scala&navHeight=130');
  const scroller = { id: 'messages', scrollTop: 100, closest: () => scroller };
  const scroll = () => page.handlers.get('scroll')({ target: scroller });
  scroll(); page.flush();
  assert.equal(page.sent.length, 1, 'automatic message positioning must not retract the navigation');
  page.handlers.get('wheel')({ target: scroller });
  scroller.scrollTop = 148; scroll();
  scroller.scrollTop = 168; scroll();
  assert.equal(page.sent.length, 1);
  page.flush();
  assert.equal(page.sent.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(page.sent[1].data)), { type: 'scala:content-scroll', scroller: 'messages', top: 168, previousTop: 100 });
  page.advance(501); scroller.scrollTop = 200; scroll(); page.flush();
  assert.equal(page.sent.length, 2, 'streamed auto-scroll after user interaction ends is ignored');
  page.handlers.get('touchmove')({ target: scroller });
  scroller.scrollTop = 176; scroll(); page.flush();
  assert.equal(page.sent[2].data.previousTop, 200);
  assert.equal(page.sent[2].data.top, 176, 'the first upward gesture keeps its real direction');
});

test('keyboard access reveals navigation without treating text editing or sidebar movement as reading', () => {
  const page = boot('?embed=scala');
  const key = page.handlers.get('keydown');
  key({ key: 'Tab' }); key({ key: 'Escape' });
  assert.equal(page.sent[1].data.type, 'scala:nav-reveal');
  assert.equal(page.sent[2].data.type, 'scala:nav-reveal');
  key({ key: 'ArrowDown', target: { closest: () => ({ tagName: 'TEXTAREA' }) } });
  page.handlers.get('scroll')({ target: { id: 'messages', scrollTop: 80 } }); page.flush();
  assert.equal(page.sent.length, 3);
  page.handlers.get('wheel')({});
  page.handlers.get('scroll')({ target: { id: 'history-panel', scrollTop: 80 } }); page.flush();
  assert.equal(page.sent.length, 3);
});
