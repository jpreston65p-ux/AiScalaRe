import { publicCommentReply } from './comments.mjs';
import { sameText } from './processor.mjs';

const safeId = value => typeof value === 'string' && /^[a-z0-9:_-]{1,160}$/i.test(value);
export class FacebookCommentProcessor {
  constructor({ store, catalog, ownerId, send, now = Date.now, dailyLimit = 100, startedAt = null, maxCommentAgeSeconds = 86400, log = () => {} }) {
    Object.assign(this, { store, catalog, ownerId, send, now, dailyLimit, log, maxCommentAgeSeconds });
    this.startedAt = Number.isFinite(startedAt) ? startedAt : Math.floor(now()/60000)*60000; this.initialized = new Set(); this.queue = new Map();
  }
  valid(event) {
    return event && [event.postId, event.id, event.authorId].every(safeId) && typeof event.isOwn === 'boolean'
      && Number.isFinite(event.at) && event.at >= Math.max(this.startedAt, this.now() - this.maxCommentAgeSeconds*1000) && event.at <= this.now() + 60000;
  }
  key(event) { return this.ownerId + ':' + event.id; }
  // Notification events are an explicit new-comment signal. Unlike the old
  // per-post baseline, the first event on an old/new post must be processed.
  handleNotification(event) {
    if (safeId(event?.postId)) this.initialized.add(event.postId);
    return this.handle(event);
  }
  baseline(postId, events) {
    if (!safeId(postId)) throw new Error('invalid_post');
    for (const event of events) if (event.postId === postId && safeId(event.id)) this.store.claim('facebook-comments', this.key(event), 'baseline');
    this.initialized.add(postId);
  }
  handle(event) {
    if (!this.valid(event) || !this.initialized.has(event.postId)) return Promise.resolve();
    const previous = this.queue.get(event.postId) || Promise.resolve();
    const running = previous.catch(() => {}).then(() => this.process(event));
    const safe = running.catch(() => this.log('error_procesando_comentario'));
    this.queue.set(event.postId, safe);
    safe.finally(() => { if (this.queue.get(event.postId) === safe) this.queue.delete(event.postId); });
    return safe;
  }
  async process(event) {
    const key = this.key(event);
    if (this.store.hasEvent('facebook-comments', key)) return;
    // Never answer the owner's own comments or a thread already answered by
    // SCALA. An incoming text cannot manufacture payment or delivery approval.
    if (event.isOwn || event.authorId === this.ownerId || event.hasOwnReply === true || event.isReply === true) {
      this.store.claim('facebook-comments', key, 'ignored'); return;
    }
    const peer = this.store.resolvePeer(['facebook-commenter:' + event.authorId]);
    const contact = this.store.contact(peer);
    if (contact.stopped) { this.store.claim('facebook-comments', key, 'paused'); return; }
    const reply = publicCommentReply(event.text, this.catalog, { productId: event.productId, formal: contact.formal, requireProductContext:true });
    if (!reply) { this.store.claim('facebook-comments', key, 'ignored'); return; }
    if (!this.store.allow(peer, this.dailyLimit) || !this.store.claim('facebook-comments', key)) return;
    if (reply.stop) this.store.saveContact(peer, { ...contact, stopped: true, updated_at: this.now() });
    try {
      const observed = await this.send(event, reply.text);
      if (!this.valid(observed) || observed.postId !== event.postId || observed.parentId !== event.id || observed.isOwn !== true
        || observed.authorId !== this.ownerId || !sameText(observed.text, reply.text)) throw new Error('unconfirmed_comment');
      this.store.mark('facebook-comments', key, 'sent'); this.log('respuesta_publica_confirmada');
    } catch {
      this.store.mark('facebook-comments', key, 'uncertain'); this.log('comentario_sin_confirmar');
    }
  }
  async drain() { await Promise.all([...this.queue.values()]); }
}
