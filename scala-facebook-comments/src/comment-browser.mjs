import { facebookUrl, facebookPostUrl } from './config.mjs';
import { fingerprint } from './browser.mjs';
import { sameText } from './processor.mjs';
import { readCommentDom, parseSpanishFacebookTime, commentThreadDepth, readPostCaption } from './comment-dom.mjs';
import { normalize } from './catalog.mjs';
import {facebookProfileId} from './connection-flow.mjs';

export const postUrl = facebookPostUrl;
export function authorId(href, base) {
  if (typeof href !== 'string' || !href.trim()) throw new Error('comment_author_unknown');
  const url = new URL(facebookUrl(new URL(href, base).href));
  const numeric = url.searchParams.get('id') || (/^\/people\/[^/]+\/(\d+)\/?$/.exec(url.pathname)?.[1]);
  if (numeric && /^\d+$/.test(numeric)) return numeric;
  if (!/^\/[a-z0-9._-]+\/?$/i.test(url.pathname) || ['reel','watch','groups','pages','me'].includes(url.pathname.replaceAll('/', ''))) throw new Error('comment_author_unknown');
  return fingerprint(url.pathname.toLowerCase().replace(/\/$/, ''));
}
export function commentIdentity(href, ownerId) {
  const url = new URL(facebookUrl(href));
  const parent = url.searchParams.get('comment_id'), reply = url.searchParams.get('reply_comment_id');
  if (!/^\d+$/.test(parent || '') || reply != null && !/^\d+$/.test(reply)) throw new Error('comment_identity_unknown');
  return { id:reply || parent, parentId:reply ? parent : null, post:postUrl(url.href, ownerId) };
}
// Only the normal, visible Facebook interface is used. A runtime login must
// still happen in this program's browser; the ChatGPT session is independent.
export class FacebookCommentsBrowser {
  constructor(page, config, catalog=null,stage=()=>{}) { this.page=page;this.config=config;this.catalog=catalog;this.c=config.comments;this.s=this.c.selectors;this.current=null;this.stage=stage; }
  async verifyAccount({navigate=true}={}) {
    await this.checkLogin();
    const currentId=facebookProfileId(this.page.url());
    if(currentId===this.c.ownerId){this.stage('comprobar_perfil_abierto');return;}
    if(!navigate)throw new Error(currentId ? 'page_identity_changed' : 'profile_not_open');
    this.stage('abrir_perfil');
    await this.page.goto('https://www.facebook.com/me/',{waitUntil:'commit',timeout:60000});
    this.stage('esperar_identidad_perfil');
    await this.page.waitForURL(url=>url.hostname==='www.facebook.com' && !/^\/me\/?$/.test(url.pathname),{waitUntil:'commit',timeout:60000});
    await this.checkLogin();
    if(facebookProfileId(this.page.url())!==this.c.ownerId)throw new Error('page_identity_changed');
  }
  async checkLogin() {
    if(this.page.isClosed())throw new Error('browser_closed');
    // A newly created application page may still be about:blank before goto.
    if(this.page.url()==='about:blank')return;
    const url=new URL(facebookUrl(this.page.url()));
    if(/^\/(checkpoint|two_step_verification|authentication)(\/|$)/.test(url.pathname))throw new Error('facebook_verification_required');
    if(/^\/(login|recover)(\/|\.php|$)/.test(url.pathname) || await this.page.locator('input[name="email"], input[name="pass"]').count())throw new Error('sign_in_required');
  }
  scope() { return this.page.locator(this.s.postScope); }
  async guard() {
    await this.checkLogin();
    const scope=this.scope();
    if (await scope.count() !== 1) throw new Error('page_identity_changed');
    const identity=scope.locator(this.s.identity);
    if (await identity.count() !== 1 || !await identity.isVisible()
      || await identity.getAttribute('aria-label') !== 'Comentar como ' + this.config.pageName) throw new Error('page_identity_changed');
  }
  async open(post) {
    let matches=false;
    try { matches=this.current?.id===post.id && this.current?.commentId===post.commentId && fingerprint(postUrl(this.page.url(),this.c.ownerId))===post.id; } catch {}
    this.stage('abrir_publicacion');
    if (!matches) await this.page.goto(post.sourceUrl || post.url,{waitUntil:'commit',timeout:60000});
    this.stage('esperar_campo_comentar');
    await this.page.locator(this.s.identity).waitFor({state:'visible',timeout:45000});
    await this.guard();
    const owners=this.scope().locator(this.s.postAuthor);
    if (await owners.count() !== 1 || authorId(await owners.getAttribute('href'),this.page.url()) !== this.c.ownerId
      || fingerprint(postUrl(this.page.url(),this.c.ownerId)) !== post.id) throw new Error('post_owner_changed');
    this.stage('leer_publicacion');
    const captionMore=[];
    for(const button of await this.scope().getByRole('button',{name:'Ver más',exact:true}).all()) {
      const isComment=await button.evaluate(el=>/^(Comentario|Respuesta) de /.test(el.closest('[role="article"]')?.getAttribute('aria-label') || ''));
      if(!isComment && await button.isVisible())captionMore.push(button);
    }
    if(captionMore.length===1)await captionMore[0].click({timeout:5000});
    const caption=normalize(await this.scope().evaluate(readPostCaption));
    const matchesProducts=this.catalog?.products.filter(product=>[product.title,...product.aliases].some(alias=>normalize(alias).length>=5 && caption.includes(normalize(alias)))) || [];
    this.current={...post,productId:this.c.productByPost?.[post.url] || (matchesProducts.length===1 ? matchesProducts[0].id : null)};
    const relevant=this.scope().getByRole('button',{name:/^Más relevantes/});
    if (await relevant.count()===1) {
      this.stage('ordenar_comentarios');
      await relevant.click({timeout:15000});
      await this.page.getByRole('menu',{name:'Orden de comentarios'}).getByText('Más recientes',{exact:true}).click({timeout:15000});
    }
  }
  async readRow(row) {
    const more=row.getByRole('button',{name:'Ver más',exact:true});
    if (await more.count()===1 && await more.isVisible()) await more.click({timeout:5000});
    const raw=await row.evaluate(readCommentDom,this.s);
    const identity=commentIdentity(new URL(raw.href,this.page.url()).href,this.c.ownerId);
    if (!this.current || fingerprint(identity.post) !== this.current.id || raw.isReply !== !!identity.parentId) throw new Error('comment_identity_unknown');
    const owner=authorId(raw.authorHref,this.page.url());
    return {postId:this.current.id,id:identity.id,parentId:identity.parentId,authorId:owner,authorName:raw.authorName,
      text:raw.text,at:parseSpanishFacebookTime(raw.time,this.c.timeZone),isOwn:owner===this.c.ownerId,
      isReply:raw.isReply,hasOwnReply:false,productId:this.current.productId || null};
  }
  async threadFor(row) {
    // Replies are siblings of the incoming article in both observed layouts.
    const depth=await row.evaluate(commentThreadDepth,this.s);
    return depth ? row.locator('xpath=' + Array(depth).fill('..').join('/')) : null;
  }
  async expandReplies(row) {
    const thread=await this.threadFor(row);
    if (!thread) return;
    for (let i=0;i<10;i++) {
      const visible=[];
      for (const toggle of await thread.getByRole('button',{name:/^(Ver|Mostrar).*respuest/}).all()) if (await toggle.isVisible()) visible.push(toggle);
      if (!visible.length) return;
      if (visible.length !== 1) throw new Error('selectors_not_calibrated');
      await visible[0].click({timeout:5000});
    }
    throw new Error('replies_not_loaded');
  }
  async replies(parentId,{allowPending=false}={}) {
    const result=[];
    for (const row of await this.scope().locator(this.s.replyRows).all()) {
      if (!await row.isVisible()) continue;
      let event;
      try{event=await this.readRow(row);}catch(error){
        if(allowPending && error.message==='comment_identity_unknown' && /Publicando/.test(await row.innerText()))continue;
        throw error;
      }
      if (event.parentId===parentId) result.push(event);
    }
    return result;
  }
  async comments() {
    await this.guard();
    if (!this.current || fingerprint(postUrl(this.page.url(),this.c.ownerId)) !== this.current.id) throw new Error('post_owner_changed');
    const result=[];
    for (const row of await this.scope().locator(this.s.commentRows).all()) {
      if (!await row.isVisible()) continue;
      await this.expandReplies(row);
      const event=await this.readRow(row);
      event.hasOwnReply=(await this.replies(event.id)).some(reply=>reply.isOwn);
      result.push(event);
    }
    return result;
  }
  async rowFor(id) {
    const found=[];
    for (const row of await this.scope().locator(this.s.commentRows).all()) if (await row.isVisible() && (await this.readRow(row)).id===id) found.push(row);
    if (found.length !== 1) throw new Error('comment_identity_unknown');
    return found[0];
  }
  async send(event,text) {
    await this.guard();
    if (this.current?.id !== event.postId) throw new Error('post_owner_changed');
    const row=await this.rowFor(event.id),initial=await this.readRow(row);
    await this.expandReplies(row);
    const existing=await this.replies(event.id);
    if (initial.isOwn || existing.some(reply=>reply.isOwn) || initial.authorId !== event.authorId || !sameText(initial.text,event.text)) throw new Error('comment_changed');
    const previous=new Set(existing.map(reply=>reply.id));
    for (const old of await this.scope().getByRole('textbox',{name:/^Responde a /}).all()) if ((await old.innerText()).trim()) throw new Error('human_draft_present');
    await row.getByRole('button',{name:'Responder',exact:true}).click({timeout:5000});
    const thread=await this.threadFor(row);
    if (!thread) throw new Error('selectors_not_calibrated');
    const composer=thread.getByRole('textbox',{name:'Responde a ' + initial.authorName,exact:true});
    if (await composer.count() !== 1 || !await composer.isVisible()) throw new Error('selectors_not_calibrated');
    const autoMention=(await composer.innerText()).trim();
    if (autoMention && autoMention !== initial.authorName) throw new Error('human_draft_present');
    await composer.fill(text);
    await this.guard();
    const check=await this.readRow(await this.rowFor(event.id));
    if ((await this.replies(event.id)).some(reply=>reply.isOwn) || check.authorId !== event.authorId || !sameText(check.text,event.text)
      || !sameText(await composer.innerText(),text)) throw new Error('comment_changed');
    const enabled=[];
    for (const button of await thread.getByRole('button',{name:'Publicar comentario',exact:true}).all()) if (await button.isVisible() && await button.isEnabled()) enabled.push(button);
    if (enabled.length !== 1) throw new Error('selectors_not_calibrated');
    await enabled[0].click({timeout:5000});
    const deadline=Date.now()+15000;
    while (Date.now()<deadline) {
      for (const reply of await this.replies(event.id,{allowPending:true})) if (!previous.has(reply.id) && reply.isOwn && sameText(reply.text,text)) return reply;
      await new Promise(resolve=>setTimeout(resolve,400));
    }
    throw new Error('unconfirmed_comment');
  }
}
