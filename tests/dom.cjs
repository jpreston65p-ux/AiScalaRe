// Minimal DOM for browser-free client checks. Layout is not simulated.
const vm = require("node:vm");
class Node {
  constructor(tag = 'div', attrs = {}) {
    this.tagName = tag.toUpperCase(); this.attrs = {}; this.dataset = {};
    this.listeners = {}; this.children = []; this.value = ''; this.hidden = false;
    this.textContent = ''; this.scrollHeight = 44; this.tabIndex = 0;
    this.style = { setProperty(k,v) { this[k] = v; } };
    this.classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(n => this.classes.add(n)),
      remove: (...names) => names.forEach(n => this.classes.delete(n)),
      contains: n => this.classes.has(n),
      toggle: (n, force) => { const on = force === undefined ? !this.classes.has(n) : force; on ? this.classes.add(n) : this.classes.delete(n); return on; }
    };
    Object.entries(attrs).forEach(([k,v]) => this.setAttribute(k,v));
    this.contentWindow = { postMessage: () => {}, location: { reload: () => { this.reloaded = true; } } };
  }
  setAttribute(k,v) {
    this.attrs[k] = String(v);
    if(k === 'class') this.classes = new Set(String(v).split(/\s+/));
    if(k === 'id') this.id = v;
    if(k === 'hidden') this.hidden = true;
    if(k === 'value') this.value = v;
    if(k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())] = v;
  }
  get className() { return [...this.classes].join(' '); }
  set className(value) { this.setAttribute('class', value); }
  get textContent() { return (this.text || '') + this.children.map(n => n.textContent || '').join(''); }
  set textContent(value) { this.text = String(value); this.children = []; }
  get childNodes() { return this.children; }
  toggleAttribute(k, force) { const on = force === undefined ? !this.hasAttribute(k) : force; on ? this.setAttribute(k, '') : this.removeAttribute(k); return on; }
  getAttribute(k) { if(k === 'src') return this.src || this.attrs[k] || null; return this.attrs[k] ?? null; }
  hasAttribute(k) { return Object.hasOwn(this.attrs,k); }
  removeAttribute(k) { delete this.attrs[k]; if(k === 'srcdoc') delete this.srcdoc; }
  remove() { this.removed=true; }
  addEventListener(k,fn) { (this.listeners[k] ||= []).push(fn); }
  async emit(k, props = {}) {
    const e = Object.assign({type:k,target:this,button:0,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}},props);
    for(const fn of this.listeners[k] || []) await fn(e);
    return e;
  }
  dispatchEvent(e) { this.lastDispatch = this.emit(e.type,e); return !e.defaultPrevented; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.text = ''; this.children = items; }
  get lastElementChild() { return this.children.at(-1); }
  focus() { if(this.doc) this.doc.activeElement = this; }
  scrollIntoView() { this.scrolled = true; }
  getClientRects() { return [{}]; }
  getBoundingClientRect() { return {left:0,right:400,top:0,bottom:400}; }
  querySelectorAll(q) { return this.children.flatMap(n => n instanceof Node ? [...(n.matches(q) ? [n] : []), ...n.querySelectorAll(q)] : []); }
  querySelector(q) { return this.querySelectorAll(q)[0] || null; }
  matches(q) {
    if(q.includes(',')) return q.split(',').some(s => this.matches(s));
    const tag = q.match(/^[a-z]+/i)?.[0]; if(tag && this.tagName.toLowerCase() !== tag) return false;
    const cls = q.match(/\.([\w-]+)/)?.[1]; if(cls && !this.classList.contains(cls)) return false;
    for(const m of q.matchAll(/\[([\w-]+)(?:([=^]+)"([^"]*)")?\]/g)) {
      if(!this.hasAttribute(m[1])) return false;
      const value = this.getAttribute(m[1]);
      if(m[2] === '=' && value !== m[3]) return false;
      if(m[2] === '^=' && !value.startsWith(m[3])) return false;
    }
    return true;
  }
  closest(q) { return this.matches(q) ? this : null; }
}
function context(text, options = {}) {
  const bodyText = text.slice(text.indexOf('<body'));
  const nodes = [];
  for(const m of bodyText.split('<script')[0].matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
    const attrs = {};
    for(const a of m[2].matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/g)) attrs[a[1]]=a[2]??a[3]??a[4]??'';
    nodes.push(new Node(m[1],attrs));
  }
  const doc = new Node('document');
  const headNodes=[];
  for(const m of text.matchAll(/<(script|style)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    if(m[1]==='script'&&!m[2].includes('application/json'))continue;
    const attrs={};
    for(const a of m[2].matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/g))attrs[a[1]]=a[2]??a[3]??a[4]??'';
    const n=new Node(m[1],attrs);n.textContent=m[3];headNodes.push(n);
  }
  doc.body = nodes.find(n=>n.tagName==='BODY');
  doc.head = new Node('head');
  const htmlAttrs = {};
  for(const a of (text.match(/<html\b([^>]*)>/i)?.[1] || '').matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/g)) htmlAttrs[a[1]]=a[2]??a[3]??a[4]??'';
  doc.documentElement = new Node('html', htmlAttrs);
  const allNodes=()=>[...nodes,...headNodes].filter(n=>!n.removed);
  doc.getElementById = id => allNodes().find(n=>n.id===id) || null;
  doc.querySelectorAll = q => allNodes().filter(n=>n.matches(q));
  doc.createElement = tag => { const n=new Node(tag); n.doc=doc; return n; };
  doc.createElementNS = (_,tag) => doc.createElement(tag);
  doc.createTextNode = value => { const n = new Node('text'); n.textContent = value; return n; };
  doc.createDocumentFragment = () => new Node('fragment');
  // Preserve enough real nesting for message bodies, SVG controls and dialogs.
  const stack = []; let nodeIndex = 0;
  const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  for(const token of bodyText.split('<script')[0].matchAll(/<(\/)?([a-z][\w-]*)\b([^>]*)>/gi)) {
    if(token[1]) { while(stack.length) { const n = stack.pop(); if(n.tagName.toLowerCase() === token[2].toLowerCase()) break; } continue; }
    const n = nodes[nodeIndex++]; if(stack.length) stack.at(-1).append(n);
    if(!voidTags.has(token[2].toLowerCase()) && !token[3].endsWith('/')) stack.push(n);
  }
  nodes.forEach(n=>{n.doc=doc;});
  const win = new Node('window');
  const parent = options.parent || win;
  const storage = new Map(), timers = new Map(), blobs = new Map(); let tid=0;
  class RuntimeURL extends URL {
    static createObjectURL(blob) {
      if(options.blockObjectURLs)throw Error('object URLs blocked');
      const url=URL.createObjectURL(blob);blobs.set(url,blob);return url;
    }
  }
  const location = { hash: '', href:'file:///downloads/SCALA-completo.html' };
  const media = () => options.legacy ? {matches:false,addListener(){}} : {matches:false,addEventListener(){}};
  const storageAPI = {
    getItem(k){if(options.noStorage)throw Error('storage blocked');return storage.get(k)||null;},
    setItem(k,v){if(options.noStorage)throw Error('storage blocked');storage.set(k,v);}
  };
  const api = {
    document:doc,window:win,parent,location,navigator:{onLine:options.online!==false},
    history:{pushState(_,__,hash){if(options.noHistory)throw Error('history blocked');location.hash=hash;}},
    matchMedia:media,localStorage:storageAPI,
    crypto:options.noCrypto?undefined:{randomUUID:()=> 'id-'+Math.random()},
    setTimeout(fn,ms){timers.set(++tid,{fn,ms});return tid;},clearTimeout(id){timers.delete(id);},
    requestAnimationFrame:fn=>fn(),cancelAnimationFrame(){},setInterval(){return ++tid;},scrollTo(){},getComputedStyle:()=>({fontSize:'16px'}),
    AbortController,URL:RuntimeURL,Blob:options.noBlob?undefined:Blob,atob,Event,console,TextDecoder,TextEncoder,Response,
    fetch:options.fetch || (()=>{throw Error('unexpected fetch');}),
    addEventListener:win.addEventListener.bind(win)
  };
  Object.assign(win,api);
  api.globalThis = win;
  win.parent=parent;
  const video=doc.getElementById('sample-video');
  if(video){video.querySelectorAll=q=>nodes.filter(n=>n.tagName==='SOURCE'&&n.matches(q));video.pause=()=>{video.paused=true;};video.play=async()=>{video.played=true;if(options.rejectVideo)throw Error('autoplay blocked');};video.load=()=>{video.retried=true;};}
  const ctx=vm.createContext(api);
  return {ctx,doc,win,nodes,headNodes,blobs,storage,get:doc.getElementById,run(code){vm.runInContext(code,ctx);},async tick(ms){for(const [id,t] of [...timers])if(t.ms<=ms){timers.delete(id);await t.fn();}}};
}

module.exports = { context };
