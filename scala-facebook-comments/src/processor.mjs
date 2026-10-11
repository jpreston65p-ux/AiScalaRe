import { randomBytes } from 'node:crypto';
import { decideReply, normalize } from './catalog.mjs';
import { customerText } from './messages.mjs';
export const sameText = (left, right) => typeof left === 'string' && typeof right === 'string' && left.replace(/\s+/g, ' ').trim() === right.replace(/\s+/g, ' ').trim();

export function renderReply(reply) {
  if (!reply) return { text: null, options: {} };
  if (reply.type === 'text') return { text: reply.text.body, options: {} };
  const menu = reply.interactive;
  const choices = menu.type === 'list' ? menu.action.sections.flatMap(section => section.rows) : menu.action.buttons.map(button => button.reply);
  const options = Object.fromEntries(choices.map((choice, index) => [String(index + 1), choice.id]));
  const rows = choices.map((choice, index) => `${index + 1}. ${choice.title}${choice.description ? ' — ' + choice.description : ''}`);
  const footer = customerText('Escribe el número de la opción que prefieras.\nMENÚ: volver al inicio · BAJA: pausar respuestas.', {}, reply.formal);
  return { text: `${menu.body.text}\n\n${rows.join('\n')}\n\n${footer}`, options };
}

// The connector supplies observed messages; client text never creates events,
// confirms payment, selects another recipient or changes account permissions.
export class FacebookProcessor {
  constructor({ store, catalog, send, now = Date.now, dailyLimit = 1000, log = () => {} }) {
    Object.assign(this, { store, catalog, send, now, dailyLimit, log });
    this.startedAt = now(); this.queue = new Map();
  }
  validate(event) {
    return event && typeof event.thread === 'string' && /^[a-z0-9:_-]{1,160}$/i.test(event.thread) && typeof event.id === 'string' && event.id.length > 0 && event.id.length <= 160 && ['in', 'out'].includes(event.direction) && Number.isFinite(event.at) && event.at >= Math.max(this.startedAt - 300000, this.now() - 300000) && event.at <= this.now() + 60000;
  }
  peer(thread) { return this.store.resolvePeer(['facebook:' + thread]); }
  baseline(events) {
    for (const event of events) if (this.validate(event)) this.store.claim('facebook-seen', event.thread + ':' + event.id, 'baseline');
  }
  handle(event) {
    if (!this.validate(event)) return Promise.resolve();
    const previous = this.queue.get(event.thread) || Promise.resolve();
    const running = previous.catch(() => {}).then(() => this.process(event));
    const safe = running.catch(() => this.log('error_procesando'));
    this.queue.set(event.thread, safe);
    safe.finally(() => { if (this.queue.get(event.thread) === safe) this.queue.delete(event.thread); });
    return safe;
  }
  async process(event) {
    const key = event.thread + ':' + event.id;
    if (this.store.hasEvent('facebook-seen', key)) return;
    const peer = this.peer(event.thread), contact = this.store.contact(peer), now = this.now();
    if (event.direction === 'out') {
      this.store.claim('facebook-seen', key, 'outgoing');
      if (this.store.hasEvent('facebook-own', key)) return;
      // Ignore all historical outgoing messages, even on a newly listed thread.
      if (event.at < this.startedAt || event.at < (contact.restarted_at || 0)) return;
      this.store.saveContact(peer, { ...contact, handoff_until: now + 86400000, options: {}, updated_at: now });
      this.log('atencion_humana'); return;
    }
    if (event.at < this.startedAt || event.at < contact.last_inbound_at) return;
    if (!this.store.allow(peer, this.dailyLimit)) { this.log('limite'); return; }
    if (!this.store.claim('facebook-seen', key)) return;
    const text = typeof event.text === 'string' ? event.text.slice(0, 2000) : '';
    const input = text || (event.hasAttachment === true ? '__attachment__' : '');
    if (!input) { this.store.mark('facebook-seen', key, 'ignored'); return; }
    const n = normalize(input), translated = contact.options?.[n] || input;
    const result = decideReply(translated, contact, this.catalog, now, { hasAttachment: event.hasAttachment === true, attachmentType: event.attachmentType, trustedOrders: this.store.trustedOrders(peer) });
    const rendered = renderReply(result.reply), next = result.next;
    const restarted = ['menu', 'inicio', 'activar', 'activar bot', 'bot'].includes(n);
    this.store.saveContact(peer, { ...contact, product_id: next.productId, handoff_until: next.handoffUntil, stopped: next.stopped, options: rendered.options,
      welcomed: next.welcomed, formal: next.formal, awaiting_receipt: next.awaitingReceipt, receipt_received: next.receiptReceived, hours_notice_key: next.hoursNoticeKey,
      last_inbound_at: event.at, restarted_at: restarted ? now : contact.restarted_at, updated_at: now });
    if (!rendered.text) { this.store.mark('facebook-seen', key, 'ignored'); return; }
    const id = 'FBSCALA' + randomBytes(16).toString('hex');
    this.store.saveOutgoing(id, rendered.text);
    try {
      const observed = await this.send(event.thread, rendered.text, { lastIncomingId: event.id });
      if (!observed || !this.validate(observed) || observed.thread !== event.thread || observed.direction !== 'out' || !sameText(observed.text, rendered.text)) throw new Error('unconfirmed_send');
      this.store.claim('facebook-own', event.thread + ':' + observed.id, 'owned');
      this.store.mark('facebook-seen', key, 'sent'); this.log('respuesta_confirmada_en_interfaz');
    } catch {
      this.store.mark('facebook-seen', key, 'uncertain'); this.log('envio_sin_confirmar');
    }
  }
  async drain() { await Promise.all([...this.queue.values()]); }
}
