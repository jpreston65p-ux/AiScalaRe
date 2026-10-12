import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseHTML} from 'linkedom';
import {readCommentDom,commentThreadDepth,parseSpanishFacebookTime,readPostCaption} from '../src/comment-dom.mjs';
import {commentIdentity} from '../src/comment-browser.mjs';
import {notificationTarget,FacebookCommentNotifications} from '../src/comment-notifications.mjs';
import {validateConfig} from '../src/config.mjs';
import {Store} from '../src/store.mjs';

const config=JSON.parse(readFileSync(new URL('../facebook.config.json',import.meta.url),'utf8'));
const s=config.comments.selectors,owner=config.comments.ownerId;
const post='https://www.facebook.com/reel/987654321/';
// Sanitized structural fixtures from the observed interfaces. No user profile,
// contacts, session, images or actual customer name is stored in the project.
const root=(id='111')=>`<div role="article" aria-label="Comentario de Cliente Ejemplo hace 1 minuto"><a role="link" aria-hidden="true" href="https://www.facebook.com/client.example?comment_id=Y29tbWVudA==">Avatar</a><a role="link" aria-hidden="false" href="https://www.facebook.com/client.example?comment_id=Y29tbWVudA==">Cliente Ejemplo</a><a role="link" aria-label="domingo, 11 de octubre de 2026 a las 5:13 pm" href="${post}?comment_id=${id}">1 min</a><span dir="auto" lang="es"><div>¿Precio y PDF?</div></span><div role="button">Responder</div></div>`;
const reply=`<div role="article" aria-label="Respuesta de Scala Fe al comentario de Cliente Ejemplo hace 1 minuto"><a role="link" aria-hidden="false" href="https://www.facebook.com/profile.php?id=${owner}&comment_id=Y29tbWVudA==">Scala Fe</a><a role="link" aria-label="domingo, 11 de octubre de 2026 a las 5:14 pm" href="${post}?comment_id=111&reply_comment_id=222">1 min</a><span dir="auto" lang="es"><div>¡Hola! <img alt="😊"> Soy el asistente virtual de SCALA.</div><div>El cuento es digital PDF <img alt="💙">.</div></span><div role="button">Responder</div></div>`;
function doc(html){return parseHTML(`<html><body>${html}</body></html>`).document;}

test('se usa el identificador numérico del enlace de fecha, no el ID codificado del autor',()=>{
  const document=doc(root()),raw=readCommentDom(document.querySelector('[role="article"]'),s);
  assert.equal(raw.authorName,'Cliente Ejemplo');assert.equal(raw.text,'¿Precio y PDF?');
  assert.deepEqual(commentIdentity(raw.href,owner),{id:'111',parentId:null,post});
});

test('una respuesta hermana conserva sus emojis y se relaciona con el comentario correcto',()=>{
  const document=doc(`<section><div>${root()}</div><div>${reply}<div role="textbox" aria-label="Responde a Cliente Ejemplo"></div></div></section>`);
  const parent=document.querySelector(s.commentRows),out=document.querySelector(s.replyRows);
  assert.equal(parent.querySelector(s.replyRows),null);
  assert.equal(commentThreadDepth(parent,s),2);
  const raw=readCommentDom(out,s);
  assert.equal(raw.isReply,true);assert.match(raw.text,/😊/);assert.match(raw.text,/💙/);
  assert.deepEqual(commentIdentity(raw.href,owner),{id:'222',parentId:'111',post});
});

test('el borrador de otro hilo no se asocia al comentario que el bot pretende responder',()=>{
  const document=doc(`<main><section><div>${root('111')}</div><div>${reply}<div role="textbox" aria-label="Responde a Cliente Ejemplo">Borrador humano</div></div></section><section><div>${root('333')}</div></section></main>`);
  const second=Array.from(document.querySelectorAll(s.commentRows))[1];
  assert.equal(commentThreadDepth(second,s),null);
});

test('la fecha completa en español se convierte usando la zona horaria configurada',()=>{
  const now=Date.parse('2026-10-11T22:00:00Z');
  assert.equal(parseSpanishFacebookTime('domingo, 11 de octubre de 2026 a las 5:13 pm','America/La_Paz',now),Date.parse('2026-10-11T21:13:00Z'));
  assert.equal(parseSpanishFacebookTime('domingo, 11 de octubre de 2026 a las 12:00 am','America/La_Paz',now),Date.parse('2026-10-11T04:00:00Z'));
});

test('fechas relativas, imposibles, futuras o ambiguas nunca sirven para autorizar un envío',()=>{
  const now=Date.parse('2026-11-10T22:00:00Z');
  for(const text of ['hace 1 minuto','domingo, 31 de febrero de 2026 a las 5:13 pm','domingo, 11 de octubre de 2026 a las 13:13 pm'])assert.throws(()=>parseSpanishFacebookTime(text,'America/La_Paz',now),/unreliable_timestamp/);
  assert.throws(()=>parseSpanishFacebookTime('domingo, 1 de noviembre de 2026 a las 1:30 am','America/New_York',now),/unreliable_timestamp/);
  assert.throws(()=>parseSpanishFacebookTime('domingo, 11 de octubre de 2026 a las 5:13 pm','America/La_Paz',Date.parse('2026-10-10T00:00:00Z')),/unreliable_timestamp/);
});

test('los avisos sirven para reels nuevos y fotos antiguas sin lista ni límite de publicaciones',()=>{
  const reel=notificationTarget(post+'?comment_id=111&notif_id=555&notif_t=feed_comment&ref=notif',owner);
  assert.equal(reel.url,post);assert.equal(reel.commentId,'111');assert.doesNotMatch(reel.sourceUrl,/notif_id|ref=|notif_t/);
  const photo=notificationTarget(`https://www.facebook.com/permalink.php?story_fbid=pfbidOldPhoto&id=${owner}&comment_id=333&notif_t=feed_comment`,owner);
  assert.equal(photo.commentId,'333');
  assert.equal(notificationTarget(`https://www.facebook.com/permalink.php?story_fbid=pfbidOther&id=99999&comment_id=333&notif_t=feed_comment`,owner),null);
  assert.equal(notificationTarget('https://www.facebook.com/groups/123/?comment_id=111&notif_t=feed_comment',owner),null);
  assert.equal(notificationTarget(post+'?comment_id=111&notif_t=feedback_reaction_generic',owner),null);
});

test('un aviso agrupado con nuevo comment_id se detecta aunque conserve el mismo notif_id',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'scala-notif-test-')),store=new Store(directory);
  t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
  let links=[post+'?comment_id=111&notif_id=555&notif_t=feed_comment'];
  const page={url:()=> 'https://www.facebook.com/notifications/',locator:selector=>selector.startsWith('input')?{count:async()=>0}:{all:async()=>links.map(href=>({isVisible:async()=>true,getAttribute:async()=>href}))}};
  const watcher=new FacebookCommentNotifications(page,config,store);watcher.refreshedAt=Date.now();
  assert.deepEqual(await watcher.collect(),[]);
  links=[post+'?comment_id=333&notif_id=555&notif_t=feed_comment'];
  assert.equal((await watcher.collect())[0].commentId,'333');
  const restarted=new FacebookCommentNotifications(page,config,store);restarted.refreshedAt=Date.now();
  links=[...links,post+'?comment_id=444&notif_id=777&notif_t=feed_comment'];
  assert.deepEqual((await restarted.collect()).map(target=>target.commentId),['333','444']);
  restarted.complete('333');restarted.complete('444');
  assert.deepEqual(await restarted.collect(),[]);
});

test('configuración calibrada acepta el modo de avisos con lectura cada 3 segundos',()=>{
  const validated=validateConfig({...config,verifiedPage:true,allowSending:true});
  assert.equal(validated.pollSeconds,3);assert.equal(validated.comments.monitor,'notifications');
  assert.equal(validated.comments.notificationRefreshSeconds,5);
  assert.throws(()=>validateConfig({...config,verifiedPage:true,allowSending:true,comments:{...config.comments,notificationRefreshSeconds:4}}),/invalid_config/);
  assert.equal(validated.comments.maxPosts,undefined);
  assert.throws(()=>validateConfig({...config,verifiedPage:true,allowSending:true,comments:{...config.comments,timeZone:''}}),/invalid_config/);
});

test('la comprobación inicial abre el comentario verificado y rechaza enlaces fuera de esa publicación o con datos de acceso',()=>{
  const configured={...config,verifiedPage:true,allowSending:true};
  const validated=validateConfig(configured);
  assert.equal(new URL(validated.comments.verificationUrl).searchParams.get('comment_id'),'1113975274440060');
  for(const verificationUrl of ['https://www.facebook.com/reel/999999999/?comment_id=111',config.comments.verificationUrl+'&access_token=valor_ficticio','https://example.invalid/?comment_id=111'])assert.throws(()=>validateConfig({...configured,comments:{...config.comments,verificationUrl}}));
});

test('la publicación identifica un producto sin utilizar textos de otros visitantes como configuración',()=>{
  const document=doc(`<section><h3>Scala Fe</h3><p>Conoce Gedeón, el valiente obediente.</p>${root()}<div role="textbox">Borrador privado</div></section>`);
  const caption=readPostCaption(document.querySelector('section'));
  assert.match(caption,/Gedeón/);
  assert.doesNotMatch(caption,/Cliente Ejemplo|Precio|Borrador privado/);
  const other=doc(`<section><p>Saludos de SCALA.</p>${root().replace('¿Precio y PDF?','Quiero Gedeón')}</section>`);
  assert.doesNotMatch(readPostCaption(other.querySelector('section')),/Gedeón/);
});

test('un comentario solo con imagen se omite sin detener la atención a comentarios de texto',()=>{
  const document=doc(root().replace('<span dir="auto" lang="es"><div>¿Precio y PDF?</div></span>','<img alt="Sticker">'));
  const raw=readCommentDom(document.querySelector(s.commentRows),s);
  assert.equal(raw.text,'');assert.equal(commentIdentity(raw.href,owner).id,'111');
});
