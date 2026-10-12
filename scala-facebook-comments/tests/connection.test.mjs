import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {facebookProfileId,connectionErrorInfo,connectionPageState,waitForConnection} from '../src/connection-flow.mjs';
import {FacebookCommentsBrowser} from '../src/comment-browser.mjs';

const config=JSON.parse(readFileSync(new URL('../facebook.config.json',import.meta.url),'utf8'));
const owner=config.comments.ownerId,profile='https://www.facebook.com/profile.php?id='+owner;
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};

test('un error conserva el asistente de conexión pendiente hasta que el usuario elige reintentar',async()=>{
  const waiting=deferred(),retry=deferred();
  let attempts=0,questions=0,uploaded=0,closed=false;
  const errors=[];
  const run=waitForConnection({prepare:async()=>{},question:async()=>{
    if(++questions===1)return '';
    waiting.resolve();return retry.promise;
  },check:async()=>{
    if(++attempts===1)throw Object.assign(new Error('timeout con dato privado'),{name:'TimeoutError'});
    uploaded++;
  },onError:error=>{errors.push(connectionErrorInfo(error));}}).finally(()=>{closed=true;});
  await waiting.promise;
  assert.equal(attempts,1);assert.equal(uploaded,0);assert.equal(closed,false);
  assert.equal(errors[0].code,'tiempo_de_espera_agotado');
  retry.resolve('');assert.equal(await run,true);
  assert.equal(attempts,2);assert.equal(uploaded,1);assert.equal(closed,true);
});

test('SALIR cancela sin verificar ni enviar una sesión',async()=>{
  let checked=false;
  const result=await waitForConnection({prepare:async()=>{},question:async()=> 'SALIR',check:async()=>{checked=true;},onError:()=>{}});
  assert.equal(result,false);assert.equal(checked,false);
});

test('si el navegador falla al prepararse, solo se vuelve a abrir tras la decisión del usuario',async()=>{
  let prepared=0,checked=0,errors=0;
  const result=await waitForConnection({prepare:async()=>{if(++prepared===1)throw new Error('browser_closed');},
    question:async()=>'',check:async()=>{checked++;},onError:()=>{errors++;}});
  assert.equal(result,true);assert.equal(prepared,2);assert.equal(checked,1);assert.equal(errors,1);
});

test('los diagnósticos nunca incluyen errores crudos, enlaces ni valores privados',()=>{
  const secret='PRIVATE_SESSION_MARKER';
  assert.doesNotMatch(JSON.stringify(connectionErrorInfo(new Error('https://facebook.com/login?token='+secret))),new RegExp(secret+'|https:'));
  const page={isClosed:()=>false,url:()=>profile+'&token='+secret};
  assert.equal(connectionPageState(page,owner),'perfil_scala');
  assert.equal(connectionPageState({...page,isClosed:()=>true},owner),'ventana_cerrada');
});

test('el parámetro id de una publicación o un dominio ajeno no se confunde con un perfil',()=>{
  assert.equal(facebookProfileId(profile),owner);
  assert.equal(facebookProfileId(config.pageUrl),owner);
  for(const value of ['about:blank','https://example.invalid/profile.php?id='+owner,'https://www.facebook.com/permalink.php?id='+owner])assert.equal(facebookProfileId(value),null);
});

function pageAt(value) {
  let url=value,gotos=0;
  return {isClosed:()=>false,url:()=>url,locator:()=>({count:async()=>0}),
    goto:async()=>{gotos++;url=profile;},waitForURL:async predicate=>{assert.equal(predicate(new URL(url)),true);},
    get gotos(){return gotos;}};
}

test('la conexión manual no navega a /me/ y rechaza un perfil distinto',async()=>{
  const page=pageAt(profile),browser=new FacebookCommentsBrowser(page,config);
  await browser.verifyAccount({navigate:false});assert.equal(page.gotos,0);
  const other=pageAt('https://www.facebook.com/profile.php?id=99999999999');
  await assert.rejects(new FacebookCommentsBrowser(other,config).verifyAccount({navigate:false}),/page_identity_changed/);
  assert.equal(other.gotos,0);
  const home=pageAt('https://www.facebook.com/');
  await assert.rejects(new FacebookCommentsBrowser(home,config).verifyAccount({navigate:false}),/profile_not_open/);
  assert.equal(home.gotos,0);
});

test('el proceso de la nube puede comenzar en about:blank y después verifica el perfil numérico',async()=>{
  const page=pageAt('about:blank');
  await new FacebookCommentsBrowser(page,config).verifyAccount();assert.equal(page.gotos,1);
});

test('una comprobación requerida por Facebook o una ventana cerrada bloquea la conexión',async()=>{
  const checkpoint=pageAt('https://www.facebook.com/checkpoint/');
  await assert.rejects(new FacebookCommentsBrowser(checkpoint,config).verifyAccount({navigate:false}),/facebook_verification_required/);
  const closed={...pageAt(profile),isClosed:()=>true};
  await assert.rejects(new FacebookCommentsBrowser(closed,config).verifyAccount({navigate:false}),/browser_closed/);
});
