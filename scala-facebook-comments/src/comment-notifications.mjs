import { facebookUrl, facebookPostUrl } from './config.mjs';
import { fingerprint } from './browser.mjs';

export function notificationTarget(href,ownerId) {
  try {
    const url=new URL(facebookUrl(href));
    const commentId=url.searchParams.get('comment_id');
    if (url.searchParams.get('notif_t') !== 'feed_comment' || !/^\d+$/.test(commentId || '') || url.searchParams.has('reply_comment_id')) return null;
    const post=facebookPostUrl(url.href,ownerId);
    // Keep only the comment anchor, never tracking or login parameters.
    const source=new URL(post); source.searchParams.set('comment_id',commentId);
    return {id:fingerprint(post),url:post,sourceUrl:source.href,commentId};
  } catch { return null; }
}

export class FacebookCommentNotifications {
  constructor(page,config,store) { this.page=page;this.config=config;this.store=store;this.refreshedAt=0;this.initialized=store.meta('facebook-notifications-ready')==='1'; }
  async open() {
    this.stage?.('abrir_avisos');
    await this.page.goto('https://www.facebook.com/notifications/',{waitUntil:'commit',timeout:60000});
    this.stage?.('esperar_pantalla_avisos');
    await this.page.getByRole('heading',{name:'Notificaciones',exact:true}).waitFor({state:'visible',timeout:45000});
    this.stage?.('esperar_enlaces_avisos');
    await this.page.locator('a[role="link"][href*="notif_id="]').first().waitFor({state:'visible',timeout:45000});
    this.refreshedAt=Date.now();
  }
  async collect() {
    if (Date.now()-this.refreshedAt>=this.config.comments.notificationRefreshSeconds*1000) await this.open();
    if (await this.page.locator('input[name="email"], input[name="pass"]').count()) throw new Error('sign_in_required');
    if (new URL(facebookUrl(this.page.url())).pathname !== '/notifications/') throw new Error('notification_view_changed');
    // Links on the full notification screen cover old photos and new reels.
    // No timeline scan or fixed list of 20/50 posts is used.
    for (const link of await this.page.locator('a[role="link"][href*="notif_t=feed_comment"]').all()) {
      if (!await link.isVisible()) continue;
      const target=notificationTarget(await link.getAttribute('href'),this.config.comments.ownerId);
      if (!target) continue;
      this.store.transaction(()=>{
        const first=this.store.claim('facebook-notifications',target.commentId,this.initialized?'detected':'baseline');
        if (this.initialized && first) {
          const pending=JSON.parse(this.store.meta('facebook-comment-pending') || '{}');
          pending[target.commentId]=target;
          this.store.setMeta('facebook-comment-pending',JSON.stringify(pending));
        }
      });
    }
    this.initialized=true;
    this.store.setMeta('facebook-notifications-ready','1');
    return Object.values(JSON.parse(this.store.meta('facebook-comment-pending') || '{}'));
  }
  complete(commentId) {
    this.store.transaction(()=>{
      const pending=JSON.parse(this.store.meta('facebook-comment-pending') || '{}');
      delete pending[commentId];
      this.store.setMeta('facebook-comment-pending',JSON.stringify(pending));
    });
  }
}
