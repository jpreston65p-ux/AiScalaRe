import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {selectCommentOrder} from '../src/comment-order.mjs';

const selectors={identity:'[data-composer]',commentRows:'[data-comment]',replyRows:'[data-reply]'};
const norm=value=>value.replace(/\s+/g,' ').trim();
// A small DOM-backed adapter: accessibility labels, visibility and text come
// from fixtures, rather than returning whatever the sorting code expects.
class Locator {
  constructor(elements,clicks,onClick){Object.assign(this,{elements,clicks,onClick});}
  wrap(elements){return new Locator(elements,this.clicks,this.onClick);}
  locator(selector){return this.wrap(this.elements.flatMap(element=>Array.from(element.querySelectorAll(selector))));}
  getByRole(role,{name}){
    return this.locator(role==='button' ? '[role="button"],button' : '[role="'+role+'"]')
      .wrap(this.locator(role==='button' ? '[role="button"],button' : '[role="'+role+'"]').elements.filter(element=>name.test(norm(element.getAttribute('aria-label') || element.textContent))));
  }
  getByText(text){return this.wrap(this.elements.flatMap(root=>Array.from(root.querySelectorAll('*')).filter(element=>
    norm(element.textContent)===text && !Array.from(element.children).some(child=>norm(child.textContent)===text))));}
  async all(){return this.elements.map(element=>this.wrap([element]));}
  async count(){return this.elements.length;}
  async isVisible(){return !!this.elements[0] && !this.elements[0].closest('[hidden]');}
  async evaluate(fn,arg){return fn(this.elements[0],arg);}
  async getAttribute(name){return this.elements[0].getAttribute(name);}
  async innerText(){return this.elements[0].textContent;}
  async click(){const element=this.elements[0];this.clicks.push(element.id);this.onClick(element);}
}

function fixture({role='menu',label='',open=false,allOnly=false,confirm=true,inside=false}={}){
  const {document}=parseHTML(`<html><body><div id="post" role="dialog"><div data-composer></div>
    <div id="order" role="button" aria-label="Más relevantes">Más relevantes</div>
    <article data-comment><div role="button">Más recientes</div><span>Más recientes</span></article></div>
    <div id="popup" role="${role}" ${label ? 'aria-label="'+label+'"' : ''} ${open ? '' : 'hidden'}>
      ${allOnly ? '' : '<div role="button"><span id="recent">Más recientes</span></div>'}
      <div role="button"><span id="all">Todos los comentarios</span></div></div>
    <div role="menu" hidden><span>Más recientes</span></div></body></html>`);
  const popup=document.querySelector('#popup'),order=document.querySelector('#order'),clicks=[],stages=[];
  if(inside)document.querySelector('#post').appendChild(popup);
  const onClick=element=>{
    if(element.id==='order')popup.removeAttribute('hidden');
    else if(['recent','all'].includes(element.id) && confirm){order.setAttribute('aria-label',element.textContent);order.textContent=element.textContent;popup.setAttribute('hidden','');}
  };
  const page=new Locator([document],clicks,onClick),scope=new Locator([document.querySelector('#post')],clicks,onClick);
  const run=()=>selectCommentOrder(page,scope,selectors,{timeout:0,stage:value=>stages.push(value)});
  return {document,page,scope,clicks,stages,run};
}

test('un menú sin nombre accesible y con etiquetas ocultas duplicadas permite elegir Más recientes',async()=>{
  const f=fixture();await f.run();assert.deepEqual(f.clicks,['order','recent']);
  assert.equal(f.stages.at(-1),'confirmar_orden_comentarios');
});

test('un menú con otro nombre no depende de Orden de comentarios',async()=>{
  const f=fixture({label:'Ordenar los comentarios'});await f.run();assert.deepEqual(f.clicks,['order','recent']);
});

test('un popup de tipo diálogo dentro del post no se confunde con el comentario de un visitante',async()=>{
  const f=fixture({role:'dialog',inside:true});await f.run();assert.deepEqual(f.clicks,['order','recent']);
});

test('Todos los comentarios sirve cuando es la única opción reconocida y se confirma el cambio',async()=>{
  const f=fixture({allOnly:true});await f.run();assert.deepEqual(f.clicks,['order','all']);
});

test('un menú abierto se reutiliza y un filtro ya seleccionado no se vuelve a pulsar',async()=>{
  const f=fixture({open:true});await f.run();assert.deepEqual(f.clicks,['recent']);
  await f.run();assert.deepEqual(f.clicks,['recent']);
});

test('dos menús visibles con la misma opción bloquean el clic ambiguo',async()=>{
  const f=fixture({open:true});
  const extra=f.document.createElement('div');extra.setAttribute('role','menu');extra.innerHTML='<span>Más recientes</span>';
  f.document.body.appendChild(extra);
  await assert.rejects(f.run(),/selectors_not_calibrated/);assert.deepEqual(f.clicks,[]);
});

test('un clic que no cambia el filtro no se presenta como un orden confirmado',async()=>{
  const f=fixture({confirm:false});await assert.rejects(f.run(),/comment_order_unconfirmed/);
});
