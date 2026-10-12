import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {runInNewContext} from 'node:vm';
import {isCommentPanelControl,ensureCommentPanel,panelClickReason,panelControlGeometry} from '../src/comment-panel.mjs';

const selectors={identity:'[data-scala]',commentRows:'[data-comment]',replyRows:'[data-reply]'};
function element(html){return parseHTML('<html><body>'+html+'</body></html>').document.querySelector('[role="button"]');}

test('solo un control de comentarios fuera de formularios e hilos sirve para abrir el panel',()=>{
  assert.equal(isCommentPanelControl(element('<div role="button" aria-label="Comentar"></div>'),selectors),true);
  for(const html of ['<form><button role="button">Comentar</button></form>',
    '<div data-comment><div role="button">Comentar</div></div>',
    '<div data-reply><div role="button">Comentarios</div></div>',
    '<button role="button" type="submit">Comentar</button>',
    '<div role="button">Publicar comentario</div>'])assert.equal(isCommentPanelControl(element(html),selectors),false);
});

function fixture({expected=false,editors=0,controls=1,reveal=true,clickError=null,reachable=controls}={}){
  const clicks=[],logs=[];
  const node=element('<div role="button" aria-label="Comentar"></div>');
  const item={isVisible:async()=>true};
  const buttons=Array.from({length:controls},(_,index)=>({...item,
    evaluate:async(fn,arg)=>fn===panelControlGeometry ? {reachable:index<reachable} : fn(node,arg),
    click:async()=>{clicks.push('open');if(clickError)throw clickError;if(reveal)expected=true;}}));
  const identity={all:async()=>expected ? [item] : [],waitFor:async()=>{if(!expected)throw Object.assign(new Error('not_visible'),{name:'TimeoutError'});}};
  const page={locator:selector=>selector===selectors.identity ? identity : {all:async()=>Array(editors).fill(item)},
    getByRole:()=>({all:async()=>buttons})};
  const run=()=>ensureCommentPanel(page,selectors,{timeout:1,discoveryMs:0,log:info=>logs.push(info)});
  return {run,clicks,logs};
}

test('el panel ya abierto no genera un clic adicional',async()=>{
  const f=fixture({expected:true});await f.run();assert.deepEqual(f.clicks,[]);
});

test('un control único abre el panel y después se exige el campo de Scala Fe',async()=>{
  const f=fixture();await f.run();assert.deepEqual(f.clicks,['open']);
  assert.deepEqual(f.logs,[{expectedComposer:0,visibleEditors:0,commentControls:1}]);
});

test('un editor visible impide pulsar un Comentar genérico que pudiera enviar un borrador',async()=>{
  const f=fixture({editors:1});await assert.rejects(f.run(),{name:'TimeoutError'});assert.deepEqual(f.clicks,[]);
});

test('dos controles visibles no provocan un clic ambiguo',async()=>{
  const f=fixture({controls:2});await assert.rejects(f.run(),/selectors_not_calibrated/);assert.deepEqual(f.clicks,[]);
});

test('un control fuera de la vista no se confunde con el único botón que recibe el clic',async()=>{
  const f=fixture({controls:2,reachable:1});await f.run();assert.deepEqual(f.clicks,['open']);
});

test('la geometría serializada diferencia un botón cubierto y otro fuera de pantalla',()=>{
  const button=element('<div role="button" aria-label="Comentar"></div>');
  button.getBoundingClientRect=()=>({x:20,y:20,width:40,height:40});
  const overlay=element('<div role="button" aria-label="Otro control"></div>');
  const document={elementFromPoint:()=>button};
  const read=()=>runInNewContext('('+panelControlGeometry.toString()+')(element)',{element:button,document,innerWidth:1280,innerHeight:720});
  assert.equal(read().reachable,true);
  document.elementFromPoint=()=>overlay;assert.equal(read().reachable,false);assert.equal(read().blocked,true);
  button.getBoundingClientRect=()=>({x:1400,y:20,width:40,height:40});assert.equal(read().inViewport,false);
});

test('abrir un panel sin encontrar el campo autorizado no permite continuar',async()=>{
  const f=fixture({reveal:false});await assert.rejects(f.run(),{name:'TimeoutError'});
  assert.equal(f.logs.at(-1).expectedComposer,0);
});

test('el comprobador funciona serializado sin las variables del módulo de Node',()=>{
  const button=element('<div role="button" aria-label="Comentar"></div>');
  assert.equal(runInNewContext('('+isCommentPanelControl.toString()+')(element,selectors)',{element:button,selectors}),true);
});

test('un botón tapado no se fuerza ni oculta el diagnóstico y no filtra el error de Facebook',async()=>{
  const error=Object.assign(new Error('element intercepts pointer events; dato privado ficticio'),{name:'TimeoutError'});
  const f=fixture({clickError:error});await assert.rejects(f.run(),error);
  assert.equal(f.logs.at(-1).action,'open');assert.equal(f.logs.at(-1).reason,'covered');
  assert.equal(JSON.stringify(f.logs).includes('dato privado ficticio'),false);
});

test('las causas de un clic fallido se limitan a categorías sin contenido privado',()=>{
  assert.equal(panelClickReason({message:'element is outside of the viewport'}),'outside_viewport');
  assert.equal(panelClickReason({message:'element is not stable'}),'moving');
  assert.equal(panelClickReason({message:'element is not attached'}),'detached');
  assert.equal(panelClickReason({message:'otro texto privado',name:'TimeoutError'}),'timeout');
});
