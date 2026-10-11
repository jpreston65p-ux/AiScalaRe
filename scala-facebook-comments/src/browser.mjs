import { createHash } from 'node:crypto';
import { facebookUrl } from './config.mjs';
import { sameText } from './processor.mjs';

export const fingerprint = value => createHash('sha256').update(value).digest('hex');
export function parseTime(value, format) {
  const number = format === 'iso' ? Date.parse(value) : Number(value) * (format === 'seconds' ? 1000 : 1);
  if (!Number.isFinite(number) || number < 1000000000000 || number > Date.now() + 60000) throw new Error('unreliable_timestamp');
  return number;
}

// Selectors must be calibrated from the real, authorized inbox. No presumed
// Facebook layout, cookies, private API endpoints or fingerprint bypasses.
export class FacebookBrowser {
  constructor(page, config) { this.page = page; this.config = config; this.s = config.selectors; this.current = null; }
  async guard() {
    facebookUrl(this.page.url());
    if (await this.page.locator('input[name="email"], input[name="pass"]').count()) throw new Error('sign_in_required');
    const identity = this.page.locator(this.s.identity);
    if (await identity.count() !== 1 || !await identity.isVisible() || (await identity.innerText()).trim() !== this.config.pageName.trim()) throw new Error('page_identity_changed');
  }
  async threads() {
    await this.guard();
    const links = await this.page.locator(this.s.threads).all(), result = [];
    for (const link of links.slice(0, 20)) {
      if (!await link.isVisible()) continue;
      const href = await link.getAttribute('href');
      if (!href) throw new Error('selectors_not_calibrated');
      const url = facebookUrl(new URL(href, this.page.url()).href);
      const id = fingerprint(url);
      if (!result.some(thread => thread.id === id)) result.push({ id, url });
    }
    return result;
  }
  async open(thread) {
    await this.page.goto(thread.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.page.locator(this.s.activeThread).waitFor({ state: 'visible', timeout: 10000 });
    await this.guard();
    if (fingerprint(facebookUrl(this.page.url())) !== thread.id || await this.page.locator(this.s.activeThread).count() !== 1) throw new Error('thread_changed');
    this.current = thread;
  }
  async messages() {
    await this.guard();
    if (!this.current || fingerprint(facebookUrl(this.page.url())) !== this.current.id) throw new Error('thread_changed');
    const rows = await this.page.locator(this.s.messages).all(), events = [];
    for (const row of rows.slice(-30)) {
      if (!await row.isVisible()) continue;
      const outgoing = await row.evaluate((element, selector) => element.matches(selector), this.s.outgoing);
      const incoming = await row.evaluate((element, selector) => element.matches(selector), this.s.incoming);
      if (outgoing === incoming) throw new Error('message_direction_unknown');
      const textNode = row.locator(this.s.messageText);
      const text = await textNode.count() === 1 ? await textNode.innerText() : '';
      const timeNode = row.locator(this.s.messageTime);
      if (await timeNode.count() !== 1) throw new Error('unreliable_timestamp');
      const at = parseTime(await timeNode.getAttribute(this.s.timeAttribute), this.s.timeFormat);
      const attachment = this.s.attachment ? row.locator(this.s.attachment) : null;
      const hasAttachment = !!attachment && await attachment.count() > 0;
      let attachmentType = null;
      if (hasAttachment) {
        const kind = await attachment.first().getAttribute('data-type');
        attachmentType = ['image', 'document', 'audio', 'video'].includes(kind) ? kind : 'unknown';
      }
      const direction = outgoing ? 'out' : 'in';
      const suppliedId = this.s.idAttribute ? await row.getAttribute(this.s.idAttribute) : null;
      const id = fingerprint(suppliedId || `${direction}:${at}:${text}:${attachmentType || ''}`);
      events.push({ thread: this.current.id, id, direction, text, at, hasAttachment, attachmentType });
    }
    return events;
  }
  async send(thread, text, { lastIncomingId }) {
    await this.guard();
    if (this.current?.id !== thread) throw new Error('thread_changed');
    const before = await this.messages();
    if (before.filter(event => event.direction === 'in').at(-1)?.id !== lastIncomingId) throw new Error('new_message_arrived');
    const composer = this.page.locator(this.s.composer), send = this.page.locator(this.s.send);
    if (await composer.count() !== 1 || await send.count() !== 1 || !await composer.isVisible()) throw new Error('selectors_not_calibrated');
    const draft = await composer.evaluate(element => 'value' in element ? element.value : element.innerText);
    if (draft.trim()) throw new Error('human_draft_present');
    await composer.fill(text);
    await this.guard();
    const check = await this.messages();
    if (check.filter(event => event.direction === 'in').at(-1)?.id !== lastIncomingId || !sameText(await composer.evaluate(element => 'value' in element ? element.value : element.innerText), text)) throw new Error('new_message_arrived');
    await send.click({ timeout: 5000 });
    const previous = new Set(before.map(event => event.id)), deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const sent = (await this.messages()).find(event => event.direction === 'out' && !previous.has(event.id) && sameText(event.text, text));
      if (sent) return sent;
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    throw new Error('unconfirmed_send');
  }
}
