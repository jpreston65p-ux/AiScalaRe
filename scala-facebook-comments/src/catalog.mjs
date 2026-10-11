import { customerText, messages, withoutEmoji } from './messages.mjs';
import { validateHours, hoursStatus } from './hours.mjs';

export const defaultCatalog = {
  brand: 'SCALA', website: 'https://vitacala.online/', slogan: 'SCALA, para una vida edificada.',
  products: [{
    id: 'gedeon', title: 'Gedeón, el valiente obediente', category: 'books',
    format: 'Cuento digital PDF',
    description: 'Una historia basada en Jueces 6 y 7 para compartir con los niños y conversar sobre la valentía, la fe y la obediencia.',
    details: 'Está basado en la historia de Jueces 6 y 7. Acompaña a Gedeón mientras aprende a confiar en Dios y enfrentar sus temores. Su formato es digital PDF para disfrutarlo en familia.',
    price: null, url: null, delivery: null, aliases: ['gedeon', 'valiente obediente'],
  }],
  paymentInstructions: null, paymentMethods: [], paymentDetails: null, attentionHours: null,
};
export const hasPlaceholder = value => typeof value === 'string' && /\[[^\]\n]{1,200}\]/.test(value);
export function confirmedText(value, length) { return typeof value === 'string' && !hasPlaceholder(value) ? value.trim().slice(0, length) : ''; }
export function confirmedUrl(value) {
  if (value == null || typeof value === 'string' && (!value.trim() || hasPlaceholder(value))) return null;
  try { const u = new URL(value); if (u.protocol === 'https:' && !u.username && !u.password) return u.href; } catch {}
  throw new Error('invalid_catalog');
}
export function catalogFor(env = {}) {
  let source = defaultCatalog;
  if (env.WHATSAPP_CATALOG_JSON) {
    if (env.WHATSAPP_CATALOG_JSON.length > 60000) throw new Error('invalid_catalog');
    try { source = JSON.parse(env.WHATSAPP_CATALOG_JSON); } catch { throw new Error('invalid_catalog'); }
  }
  if (!source || !Array.isArray(source.products) || source.products.length > 100) throw new Error('invalid_catalog');
  const ids = new Set();
  const products = source.products.map(p => {
    if (!p || !/^[a-z0-9_-]{1,40}$/.test(p.id) || ids.has(p.id) || !confirmedText(p.title, 160)) throw new Error('invalid_catalog');
    ids.add(p.id);
    let price = null;
    if (p.price != null && !hasPlaceholder(p.price) && !hasPlaceholder(p.price?.amount) && !hasPlaceholder(p.price?.currency)) {
      if (!p.price || !Number.isFinite(p.price.amount) || p.price.amount < 0 || p.price.amount > 1000000 || !/^[A-Z]{3}$/.test(p.price.currency)) throw new Error('invalid_catalog');
      price = { amount: p.price.amount, currency: p.price.currency };
    }
    const delivery = confirmedText(p.delivery, 200);
    return { id: p.id, title: confirmedText(p.title, 160), category: p.category === 'music' ? 'music' : 'books',
      format: confirmedText(p.format, 80), description: confirmedText(p.description, 440), details: confirmedText(p.details, 600),
      aliases: Array.isArray(p.aliases) ? p.aliases.filter(v => typeof v === 'string' && !hasPlaceholder(v)).slice(0, 10).map(v => confirmedText(v, 100)) : [],
      price, url: confirmedUrl(p.url), delivery: /https?:\/\//i.test(delivery) ? null : delivery || null };
  });
  return { brand: 'SCALA', slogan: defaultCatalog.slogan, website: confirmedUrl(source.website || defaultCatalog.website), products,
    paymentInstructions: confirmedText(source.paymentInstructions, 440) || null,
    paymentMethods: Array.isArray(source.paymentMethods) ? source.paymentMethods.map(m => confirmedText(m, 80)).filter(Boolean).slice(0, 8) : [],
    paymentDetails: confirmedText(source.paymentDetails, 600) || null, attentionHours: validateHours(source.attentionHours) };
}
export function normalize(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' '); }
const plain = text => ({ type: 'text', text: { preview_url: false, body: text } });
function buttons(text, options, formal = false) {
  return { type: 'interactive', formal, interactive: { type: 'button', body: { text }, action: { buttons: options.map(([id, title]) => ({ type: 'reply', reply: { id, title } })) } } };
}
export function mainMenu(formal = false, initial = true) { return buttons(customerText(initial ? messages.welcome : '¿En qué puedo ayudarte? 😊\nPuedes consultar productos, cómo comprar o solicitar atención de una persona.', {}, formal), [['catalog', 'Ver productos'], ['buy', 'Cómo comprar'], ['human', 'Hablar con SCALA']], formal); }
function productReply(p, formal) {
  const price = p.price ? `${p.price.currency} ${p.price.amount.toFixed(2)}` : 'Necesito confirmar el precio actual con el equipo de SCALA.';
  return buttons(`📖 *${p.title}*\n${p.format}\n\n${p.description}\n\nPrecio: ${price}${p.delivery ? '\n' + p.delivery : ''}`, [['buy', 'Quiero comprar'], ['catalog', 'Ver productos'], ['human', 'Hablar con SCALA']], formal);
}
function productList(catalog, category = null, page = 0, formal = false) {
  const items = category ? catalog.products.filter(p => p.category === category) : catalog.products;
  if (!items.length) return buttons(customerText('Por ahora no hay productos de esta categoría en el catálogo. Puedes consultar al equipo de SCALA por este chat.', {}, formal), [['catalog', 'Ver productos'], ['human', 'Hablar con SCALA']], formal);
  const count = Math.ceil(items.length / 8); page = Math.max(0, Math.min(count - 1, page));
  const rows = items.slice(page * 8, page * 8 + 8).map(p => ({ id: 'product:' + p.id, title: p.title, description: p.format || 'Ver detalles' }));
  if (page + 1 < count) rows.push({ id: `catalog:${category || 'all'}:${page + 1}`, title: 'Más productos', description: 'Ver la siguiente página' });
  rows.push({ id: 'human', title: 'Hablar con SCALA', description: 'Consulta productos y compras' });
  const p = items[0];
  const body = items.length === 1 && p.id === 'gedeon' && /pdf/i.test(p.format)
    ? customerText(messages.products, { title: p.title, description: p.description, website: catalog.website || defaultCatalog.website }, formal)
    : customerText('📖 Productos de SCALA\nElige el que te interese para conocer sus detalles.\n\nNuestra página: {{website}}', { website: catalog.website || defaultCatalog.website }, formal);
  return { type: 'interactive', formal, interactive: { type: 'list', body: { text: body }, action: { button: 'Elegir producto', sections: [{ title: 'Productos', rows }] } } };
}

// Incoming text never confirms a payment or grants download access.
export function decideReply(input, session, catalog, now = Date.now(), context = {}) {
  const n = normalize(input);
  const next = { productId: session.product_id || null, handoffUntil: session.handoff_until || 0, stopped: !!session.stopped,
    welcomed: !!session.welcomed || session.last_inbound_at > 0, formal: !!session.formal,
    awaitingReceipt: !!session.awaiting_receipt, receiptReceived: !!session.receipt_received, hoursNoticeKey: session.hours_notice_key || null };
  const initial = !next.welcomed, result = reply => ({ reply, next });
  if (['menu', 'inicio', 'activar', 'activar bot', 'bot'].includes(n)) { next.handoffUntil = 0; next.stopped = false; next.welcomed = true; return result(mainMenu(next.formal, initial)); }
  if (next.stopped) return result(null);
  if (/^(baja|stop|parar|detener|cancelar bot|no me escribas|no me escriban|no mas mensajes)$/.test(n)) { next.stopped = true; return result(plain(customerText(messages.stopped, {}, next.formal))); }
  if (next.handoffUntil > now) return result(null);
  const preferFormal = /(?:tratame|tratarme|hablame|hablarme|prefiero|quiero|use|usar).*\busted\b/.test(n);
  const preferInformal = /(?:tratame|tratarme|hablame|hablarme|prefiero|quiero|use|usar).*\btu\b/.test(n);
  if (preferFormal) next.formal = true;
  if (preferInformal) next.formal = false;
  let multipleFacts = false;
  const say = (template, values) => customerText(multipleFacts ? withoutEmoji(template) : template, values, next.formal);
  const done = (reply, greet = true) => {
    if (reply && initial && greet) { if (reply.type === 'text') reply.text.body = say(messages.initial) + reply.text.body; else reply.interactive.body.text = say(messages.initial) + reply.interactive.body.text; }
    next.welcomed = true; return result(reply);
  };
  if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches|hello|hi)[!. ,🌿😊💙]*$/.test(n)) return done(initial ? mainMenu(next.formal) : plain(say(messages.greeting)), false);
  const named = catalog.products.find(p => n === 'product:' + p.id || [p.title, ...p.aliases].some(a => { const q = normalize(a); return q.length >= 4 && n.includes(q); }));
  if (named) next.productId = named.id;
  const p = catalog.products.find(p => p.id === next.productId) || (catalog.products.length === 1 ? catalog.products[0] : null);
  if (p) next.productId = p.id;
  const needsHuman = n === 'human' || /\b(humano|humana|asesor|asesora|vendedor|reclamo|reembolso)\b|(?:hablar|atencion|contactar).*(?:persona|equipo)|(?:persona|equipo).*(?:atienda|ayude)/.test(n);
  const catalogAsked = /\b(catalogo|productos|tienda)\b/.test(n);
  const priceAsked = /\b(precio|precios|costo|costos|vale|valen|cuesta|cuestan)\b|\bcuanto (?:es|sale|pago|debo)\b|^cuanto[?¿!.]*$/.test(n);
  const formatAsked = /\b(pdf|formato|digital|fisico|fisica|papel|impreso|impresa)\b/.test(n);
  const descriptionAsked = /\b(trata|historia|tema|descripcion|biblia|biblico|jueces|informacion|detalles|contenido)\b/.test(n);
  const buyAsked = n === 'buy' || /\b(comprar|compra|pedido|pedir)\b/.test(n);
  const paymentAsked = /\b(pago|pagos|pagar|transferencia|qr|deposito|metodos)\b/.test(n);
  const deliveryAsked = /\b(entrega|descargar|descarga|recibir|llega|abrir|descargo)\b|\benvio\b(?!.*\bcomprobante\b)/.test(n);
  const hoursAsked = /\b(horario|horarios|atienden|atiende|abren|abierto)\b/.test(n);
  const paidClaim = !/\bno\b.{0,25}\b(pague|pagado|transferi|transferido|deposite)\b/.test(n) && /\b(pague|transferi|deposite)\b|\bya pago\b|\bhe (pagado|transferido|depositado)|\bpago (realizado|hecho|confirmado)|\b(?:envie|enviado) (?:el|mi) comprobante\b/.test(n);
  const paymentStatusAsked = /\b(confirm|verific|revis)\w*\b/.test(n) && /\b(pago|comprobante|recibo)\b/.test(n);
  const unknownSpec = /\b(paginas|edad|edades|descuento|descuentos|promocion|promociones|actividades|colorear|pack|paquete|materiales)\b/.test(n);
  const hasReceipt = context.hasAttachment === true && ['image', 'document'].includes(context.attachmentType)
    && !/\bno\b.{0,20}\b(comprobante|recibo)\b/.test(n)
    && (/\b(comprobante|recibo|constancia de pago)\b/.test(n) || next.awaitingReceipt);
  const order = p && context.trustedOrders?.[p.id];
  const confirmed = order?.source === 'owner_console' && order.paymentConfirmed === true;
  let downloadUrl = null;
  if (confirmed && order.deliveryAuthorized === true) { try { downloadUrl = confirmedUrl(order.downloadUrl); } catch {} }
  multipleFacts = [catalogAsked, priceAsked, formatAsked, descriptionAsked, buyAsked || paymentAsked, deliveryAsked, hoursAsked, paidClaim || hasReceipt || paymentStatusAsked, unknownSpec, needsHuman].filter(Boolean).length > 1;
  const parts = [];
  const priceText = () => say(p?.id === 'gedeon' ? messages.price : '«{{title}}» cuesta {{price}}.', { title: p.title, price: `${p.price.currency} ${p.price.amount.toFixed(2)}` });
  if (hasReceipt) { next.awaitingReceipt = false; next.receiptReceived = true; }
  const orderRequested = paidClaim || hasReceipt || paymentStatusAsked || deliveryAsked;
  if (catalogAsked && multipleFacts) parts.push(catalog.products.length ? catalog.products.map(product => `${product.title}\n${product.format}\n${product.description}`).join('\n\n') : say('Por ahora no hay productos en el catálogo confirmado.'));
  if (confirmed && orderRequested) parts.push(say(downloadUrl ? messages.delivery : messages.pendingDelivery, { title: p.title, downloadUrl }));
  else if (hasReceipt) parts.push(say(messages.receipt));
  else if (paidClaim) {
    parts.push(say(next.receiptReceived ? messages.pendingPayment : messages.paidWithoutReceipt));
    if (!next.receiptReceived) next.awaitingReceipt = true;
  } else if (paymentStatusAsked) parts.push(say(messages.pendingPayment));
  else if (context.hasAttachment === true) parts.push(say(messages.attachment));
  else if (/\b(comprobante|recibo)\b/.test(n)) parts.push(say('Puedes enviar tu comprobante como imagen o archivo por este chat. Recibirlo no confirma el pago: primero debe verificarse.'));
  if (priceAsked) parts.push(p?.price ? priceText() : say(messages.missingPrice));
  if (descriptionAsked && p) parts.push(say('«{{title}}» 📖\n\n{{description}}\n\nFormato: {{format}}.', { title: p.title, description: p.details || p.description, format: p.format || 'Necesito confirmarlo con el equipo de SCALA' }));
  if (formatAsked && !descriptionAsked) parts.push(p?.id === 'gedeon' && /pdf/i.test(p.format) ? say(messages.format, { title: p.title }) : p ? `${p.title}: ${p.format || 'Necesito confirmar el formato con el equipo de SCALA.'}` : say('¿Qué producto te interesa?'));
  if ((buyAsked || paymentAsked) && !paidClaim && !hasReceipt && !paymentStatusAsked) {
    if (!p) return done(productList(catalog, null, 0, next.formal));
    if (!p.price && !priceAsked) parts.push(say(messages.missingPrice));
    if (p.price && catalog.paymentMethods.length && catalog.paymentDetails) {
      if (!priceAsked) parts.push(priceText());
      parts.push(say(messages.payment, { methods: catalog.paymentMethods.join(', '), details: catalog.paymentDetails }));
      next.awaitingReceipt = true;
    } else parts.push(say(messages.missingPayment));
  }
  if (deliveryAsked && !confirmed && !hasReceipt && !paidClaim) parts.push(p?.delivery || say(messages.missingDelivery));
  if (unknownSpec) parts.push(say('Necesito confirmar esas características o condiciones con el equipo de SCALA para darte información correcta.'));
  const hours = hoursStatus(catalog.attentionHours, now);
  if (hoursAsked) parts.push(hours ? say('El horario de atención es {{hours}}.', { hours: hours.text }) : say(messages.missingHours));
  if (/\b(web|pagina)\b/.test(n) || /\b(enlace|link)\b/.test(n) && !deliveryAsked && !paymentAsked && !paidClaim && !hasReceipt) parts.push(say('Puedes visitar nuestra página:\n{{website}}', { website: catalog.website || defaultCatalog.website }));
  if (needsHuman) { parts.push(say(messages.human), say(messages.paused)); next.handoffUntil = now + 86400000; }
  if (deliveryAsked && /\b(no (?:puedo|logro|abre|descarga)|error|problema|dificultad)\b/.test(n) && !parts.some(part => part.includes('¿'))) parts.push(say('¿Qué error aparece al intentar abrir o descargar el PDF?'));
  const needsTeam = needsHuman || (buyAsked || paymentAsked) && !(p?.price && catalog.paymentMethods.length && catalog.paymentDetails) || (paidClaim || hasReceipt) && !confirmed || priceAsked && !p?.price || deliveryAsked && !downloadUrl && !p?.delivery;
  if (hours && !hours.open && needsTeam && next.hoursNoticeKey !== hours.key) { parts.unshift(say(messages.outsideHours, { hours: hours.text })); next.hoursNoticeKey = hours.key; }
  if (parts.length) return done(plain(parts.join('\n\n')));
  const page = /^catalog:(all|books|music):(\d{1,2})$/.exec(n);
  if (page) return done(productList(catalog, page[1] === 'all' ? null : page[1], Number(page[2]), next.formal));
  if (n === 'catalog' || /\b(catalogo|productos|tienda)\b/.test(n)) return done(productList(catalog, null, 0, next.formal));
  if (/\b(musica|alabanza|alabanzas|canciones)\b/.test(n)) return done(productList(catalog, 'music', 0, next.formal));
  if (n === 'books' || /\b(cuentos|libros)\b/.test(n)) return done(productList(catalog, 'books', 0, next.formal));
  if (named) return done(productReply(named, next.formal));
  if (/\b(adios|hasta luego|hasta pronto|nos vemos|chao|chau|despedida)\b|\bgracias.{0,15}es todo\b/.test(n)) return done(plain(say(messages.goodbye)), false);
  if (/\b(gracias|thank)\b/.test(n)) return done(plain(say(messages.thanks)), false);
  if (preferFormal || preferInformal) return done(plain(say('Con gusto. Usaré el trato que prefieres. ¿Qué te gustaría conocer?')));
  return done(plain(say(messages.unknown)));
}
