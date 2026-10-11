import { randomBytes } from 'node:crypto';
import { decideReply, normalize } from './catalog.mjs';

export function normalizePeer(jid) {
  if (typeof jid !== 'string') return null;
  const match = /^(\d+)(?::\d+)?@(s\.whatsapp\.net|lid)$/.exec(jid);
  return match ? `${match[1]}@${match[2]}` : null;
}
export function timestamp(message) {
  const n = Number(message.messageTimestamp?.toString?.() ?? message.messageTimestamp);
  return Number.isFinite(n) && n > 0 ? n*1000 : 0;
}
export function readText(message) {
  let m = message.message;
  for(let i=0;i<4;i++) {
    if(m?.ephemeralMessage?.message) m = m.ephemeralMessage.message;
    else if(m?.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;
    else break;
  }
  if(!m) return null;
  const text = m.conversation ?? m.extendedTextMessage?.text ?? m.buttonsResponseMessage?.selectedButtonId ?? m.listResponseMessage?.singleSelectReply?.selectedRowId;
  if(typeof text === 'string') return text.slice(0,2000);
  const attachments = ['imageMessage','videoMessage','audioMessage','documentMessage','stickerMessage','contactMessage','contactsArrayMessage','locationMessage','liveLocationMessage','viewOnceMessage','viewOnceMessageV2'];
  return attachments.some(k => m[k]) ? '__attachment__' : null;
}
export function renderReply(reply) {
  if(!reply) return { text:null, options:{} };
  if(reply.type === 'text') return { text:reply.text.body, options:{} };
  const interactive = reply.interactive;
  const choices = interactive.type === 'list' ? interactive.action.sections.flatMap(s=>s.rows) : interactive.action.buttons.map(b=>b.reply);
  const options = Object.fromEntries(choices.map((c,i)=>[String(i+1),c.id]));
  const rows = choices.map((c,i)=>`${i+1}. ${c.title}${c.description ? ' — '+c.description : ''}`);
  return { text:`${interactive.body.text}\n\n${rows.join('\n')}\n\nResponde con el número de la opción. MENÚ: reiniciar · BAJA: detener el bot.`, options };
}

export class MessageHandler {
  constructor({store,catalog,send,resolvePeers,now=Date.now,dailyLimit=1000,log=()=>{}}) {
    Object.assign(this,{store,catalog,send,resolvePeers,now,dailyLimit,log});
    this.queues = new Map(); this.bootTime = now(); this.processed = 0;
  }
  async handleBatch(batch) {
    if(batch.type !== 'notify') return;
    const jobs = [];
    for (const message of batch.messages || []) {
      const remote = normalizePeer(message.key?.remoteJid);
      if (!remote || !message.key?.id || message.key.participant) continue;
      const time=timestamp(message),now=this.now();
      if(!time || time<Math.max(this.bootTime-300000,now-300000) || time>now+60000) continue;
      const addresses = [remote, normalizePeer(message.key.remoteJidAlt)].filter(Boolean);
      if(this.resolvePeers) addresses.push(...(await this.resolvePeers(message)).map(normalizePeer).filter(Boolean));
      const known=this.store.knownPeers(addresses);
      if(known.length>1) await Promise.all(known.map(p=>this.queues.get(p) || Promise.resolve()));
      const peer = this.store.resolvePeer(addresses);
      const previous = this.queues.get(peer) || Promise.resolve();
      const task = previous.catch(()=>{}).then(()=>this.process(message,peer,remote));
      const safe = task.catch(()=>this.log('error_procesando'));
      this.queues.set(peer,safe);
      safe.finally(()=>{ if(this.queues.get(peer)===safe) this.queues.delete(peer); });
      jobs.push(safe);
    }
    await Promise.all(jobs);
  }
  async process(message, peer, remote) {
    const time = timestamp(message), now = this.now(), id = message.key.id;
    if(!time || time < Math.max(this.bootTime-300000,now-300000) || time > now+60000) return;
    const input = readText(message);
    if(input === null) return;
    const contact = this.store.contact(peer);
    if(message.key.fromMe) {
      if(this.store.hasEvent('out',id) || this.store.hasEvent('manual',id) || time < (contact.restarted_at || 0)-1000) return;
      if(!this.store.claim('manual',id,'ignored')) return;
      contact.handoff_until = now+86400000;
      contact.options = {}; contact.updated_at = now;
      this.store.saveContact(peer,contact);
      this.log('atencion_humana');
      return;
    }
    if(this.store.hasEvent('in',id) || time < contact.last_inbound_at) return;
    if(!this.store.allow(peer,this.dailyLimit)) { this.log('limite'); return; }
    if(!this.store.claim('in',id)) return;
    const n = normalize(input);
    const translated = contact.options[n] || input;
    const result = decideReply(translated,contact,this.catalog,now);
    const rendered = renderReply(result.reply);
    const restarted = ['menu','inicio','activar','activar bot','bot'].includes(n);
    this.store.saveContact(peer,{
      ...contact, product_id:result.next.productId, handoff_until:result.next.handoffUntil,
      stopped:result.next.stopped, options:rendered.options, last_inbound_at:time,
      restarted_at:restarted ? now : contact.restarted_at, updated_at:now,
    });
    if(!rendered.text) { this.store.mark('in',id,'ignored'); return; }
    const outgoingId = 'SCALA'+randomBytes(16).toString('hex').toUpperCase();
    this.store.claim('out',outgoingId,'outgoing');
    this.store.saveOutgoing(outgoingId,rendered.text);
    try {
      await this.send(remote,rendered.text,outgoingId);
      this.store.mark('in',id,'sent'); this.store.setMeta('last_reply_at',now); this.log('respuesta_enviada');
    } catch {
      // Network outcome may be ambiguous. A replay must never send a second copy.
      this.store.mark('in',id,'uncertain'); this.store.setMeta('last_error_at',now); this.log('envio_sin_confirmar');
    }
    if(++this.processed % 100 === 0) this.store.cleanup();
  }
  async drain() { await Promise.all([...this.queues.values()]); }
}
