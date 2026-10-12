import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {isCommentPanelControl,ensureCommentPanel} from '../src/comment-panel.mjs';

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

function fixture({expected=false,editors=0,controls=1,reveal=true}={}){
  const clicks=[],logs=[];
  const node=element('<div role="button" aria-label="Comentar"></div>');
  const item={isVisible:async()=>true};
  const button={...item,evaluate:async(fn,arg)=>fn(node,arg),click:async()=>{clicks.push('open');if(reveal)expected=true;}};
  const identity={all:async()=>expected ? [item] : [],waitFor:async()=>{if(!expected)throw Object.assign(new Error('not_visible'),{name:'TimeoutError'});}};
  const page={locator:selector=>selector===selectors.identity ? identity : {all:async()=>Array(editors).fill(item)},
    getByRole:()=>({all:async()=>Array(controls).fill(button)})};
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

test('abrir un panel sin encontrar el campo autorizado no permite continuar',async()=>{
  const f=fixture({reveal:false});await assert.rejects(f.run(),{name:'TimeoutError'});
  assert.equal(f.logs.at(-1).expectedComposer,0);
});
