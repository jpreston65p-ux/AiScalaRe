import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFileSync} from 'node:fs';
import {presentationUrl,postLinksFromDom,verifiedPostAliases,selectRecentQueries} from '../src/post-view.mjs';
import {validateConfig} from '../src/config.mjs';
import {encodeSessionPacket,decodeSessionPacket} from '../src/cloud-session.mjs';

const owner='61576458508649',reel='https://www.facebook.com/reel/987654321/';
const normal='https://www.facebook.com/permalink.php?story_fbid=987654321&id='+owner;

test('un aviso de cualquier reel se abre en una publicación normal y conserva solo sus anclas',()=>{
  const shown=presentationUrl({url:reel,sourceUrl:reel+'?comment_id=12345&notif_id=999&ref=notif'},{ownerId:owner});
  assert.equal(shown,normal+'&comment_id=12345');
  assert.throws(()=>presentationUrl({url:reel,sourceUrl:'https://www.facebook.com/reel/123456789/?comment_id=12345'},{ownerId:owner}),/post_owner_changed/);
  assert.throws(()=>presentationUrl({url:reel,sourceUrl:reel+'?comment_id=secreto'},{ownerId:owner}),/comment_identity_unknown/);
});

test('la vista normal debe conservar el autor comprobado y el enlace del mismo reel',()=>{
  const aliases=verifiedPostAliases({actualUrl:normal+'&comment_id=12345',targetUrl:reel,shownUrl:normal,links:[reel+'?ref=post'],ownerId:owner});
  assert.deepEqual(aliases,[reel,normal]);
  for(const change of [{actualUrl:normal.replace('987654321','123456789')},{links:['https://www.facebook.com/reel/111222333/']},{links:[reel,'https://www.facebook.com/reel/111222333/']}]){
    assert.throws(()=>verifiedPostAliases({actualUrl:normal,targetUrl:reel,shownUrl:normal,links:[reel],ownerId:owner,...change}));
  }
});

test('la identidad de una publicación no se obtiene de enlaces insertados en comentarios',()=>{
  const {document}=parseHTML(`<html><body><section><a role="link" aria-label="fecha" href="${reel}">fecha</a><article role="article" aria-label="Comentario de Cliente"><a role="link" aria-label="fecha" href="https://www.facebook.com/reel/111222333/?comment_id=12345">fecha</a></article></section></body></html>`);
  assert.deepEqual(postLinksFromDom(document.querySelector('section'),{commentRows:'[role="article"][aria-label^="Comentario de "]',replyRows:'[role="article"][aria-label^="Respuesta de "]'}),[reel]);
});

test('un mapa de vistas no permite vincular otra cuenta ni incluir datos de acceso',()=>{
  const c=JSON.parse(readFileSync(new URL('../facebook.config.json',import.meta.url),'utf8'));
  const configured={...c,verifiedPage:true,allowSending:true};
  assert.equal(validateConfig(configured).comments.postViewByPost[c.comments.postUrls[0]].includes('permalink.php'),true);
  for(const value of [normal.replace(owner,'99999999'),normal+'&access_token=valor_ficticio','https://example.invalid/publicacion']){
    assert.throws(()=>validateConfig({...configured,comments:{...c.comments,postViewByPost:{[reel]:value}}}));
  }
});

const clock=Date.parse('2026-10-12T19:00:00Z');
const event=(id,at,text,extra={})=>({id,at,text,authorId:'cliente',isOwn:false,isReply:false,hasOwnReply:false,...extra});

test('la recuperación toma una sola consulta reciente por autor y omite hilos ya atendidos',()=>{
  const events=[event('uno',clock-120000,'hola'),event('dos',clock-60000,'precio'),event('viejo',clock-90000000,'precio',{authorId:'otro'}),event('propio',clock,'hola',{isOwn:true}),event('respuesta',clock,'hola',{isReply:true}),event('futuro',clock+120000,'hola',{authorId:'futuro'})];
  assert.deepEqual(selectRecentQueries(events,{ownerId:owner,now:clock}).map(e=>e.id),['dos']);
  events[1].hasOwnReply=true;
  assert.deepEqual(selectRecentQueries(events,{ownerId:owner,now:clock}),[]);
});

test('una solicitud de baja pendiente tiene prioridad en la recuperación',()=>{
  assert.deepEqual(selectRecentQueries([event('baja',clock-120000,'BAJA'),event('pregunta',clock-60000,'precio')],{ownerId:owner,now:clock}).map(e=>e.id),['baja']);
});

test('al reiniciar se omiten cookies opcionales vencidas sin aceptar una autenticación vencida',()=>{
  const cookie=(name,value,expires)=>({name,value,expires,domain:'.facebook.com',path:'/',httpOnly:name==='xs',secure:true,sameSite:'Lax'});
  const packet={version:1,browser:'firefox',ownerId:owner,createdAt:clock,cookies:[cookie('c_user',owner,clock/1000+86400),cookie('xs','SESION_FICTICIA',clock/1000+86400),cookie('opcional','VALOR_FICTICIO',clock/1000+60)]};
  const encoded=encodeSessionPacket(packet,owner,clock);
  assert.deepEqual(decodeSessionPacket(encoded,owner,clock+120000).cookies.map(c=>c.name),['c_user','xs']);
  assert.throws(()=>decodeSessionPacket(encoded,owner,clock+86400001),/invalid_cloud_session/);
});
