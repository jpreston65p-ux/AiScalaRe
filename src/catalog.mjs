// Owner-confirmed product information. Prices, payment instructions and delivery
// commitments are intentionally absent until SCALA supplies them.
export const defaultCatalog = {
  brand: 'SCALA',
  website: 'https://vitacala.online/',
  products: [{
    id: 'gedeon', title: 'Gedeón, el valiente obediente', category: 'books',
    format: 'Cuento digital PDF',
    description: 'Una historia infantil sobre Gedeón, basada en Jueces 6–7.',
    price: null, url: null, delivery: null,
    aliases: ['gedeon', 'valiente obediente'],
  }],
  paymentInstructions: null,
};

export function catalogFor(env = {}) {
  let source = defaultCatalog;
  if (env.WHATSAPP_CATALOG_JSON) {
    if (env.WHATSAPP_CATALOG_JSON.length > 60000) throw new Error('invalid_catalog');
    try { source = JSON.parse(env.WHATSAPP_CATALOG_JSON); } catch { throw new Error('invalid_catalog'); }
  }
  if (!source || !Array.isArray(source.products) || source.products.length > 100) throw new Error('invalid_catalog');
  const short = (value, length) => typeof value === 'string' ? value.trim().slice(0, length) : '';
  const url = value => {
    if (!value) return null;
    try { const u = new URL(value); if (u.protocol === 'https:' && !u.username && !u.password) return u.href; } catch {}
    throw new Error('invalid_catalog');
  };
  const ids = new Set();
  const products = source.products.map(p => {
    if (!p || !/^[a-z0-9_-]{1,40}$/.test(p.id) || ids.has(p.id) || !short(p.title, 160)) throw new Error('invalid_catalog');
    ids.add(p.id);
    let price = null;
    if (p.price != null) {
      if (!p.price || !Number.isFinite(p.price.amount) || p.price.amount < 0 || p.price.amount > 1000000 || !/^[A-Z]{3}$/.test(p.price.currency)) throw new Error('invalid_catalog');
      price = { amount: p.price.amount, currency: p.price.currency };
    }
    return { id: p.id, title: short(p.title, 160), category: p.category === 'music' ? 'music' : 'books', format: short(p.format, 80), description: short(p.description, 440), aliases: Array.isArray(p.aliases) ? p.aliases.filter(v => typeof v === 'string').slice(0, 10).map(v => short(v, 100)) : [], price, url: url(p.url), delivery: short(p.delivery, 200) || null };
  });
  return { brand: 'SCALA', website: url(source.website || defaultCatalog.website), products, paymentInstructions: short(source.paymentInstructions, 440) || null };
}

export function normalize(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' '); }
const button = (id, title) => ({ type: 'reply', reply: { id, title } });
function buttons(text, options) { return { type: 'interactive', interactive: { type: 'button', body: { text: text.slice(0, 1024) }, action: { buttons: options.map(([id, title]) => button(id, title)) } } }; }
export function mainMenu() { return buttons('Hola 🌿 Soy la asistente automática de SCALA. Te ayudo a consultar nuestros productos y contactar con el equipo.\n\nElige una opción o escribe tu consulta:', [['catalog', 'Ver productos'], ['buy', 'Cómo comprar'], ['human', 'Hablar con SCALA']]); }
function productReply(product) {
  const price = product.price ? `${product.price.currency} ${product.price.amount.toFixed(2)}` : 'A confirmar con el equipo de SCALA.';
  const text = `📘 *${product.title}*\n${product.format}\n\n${product.description}\n\n*Precio:* ${price}${product.delivery ? '\n*Entrega:* ' + product.delivery : ''}${product.url ? '\n\n' + product.url : ''}`;
  return buttons(text, [['buy', 'Consultar compra'], ['catalog', 'Ver productos'], ['human', 'Hablar con SCALA']]);
}
function productList(catalog, category = null, page = 0) {
  const items = category ? catalog.products.filter(p => p.category === category) : catalog.products;
  if (!items.length) return buttons('Todavía no tengo productos publicados en esta categoría. Puedes consultar con el equipo de SCALA o volver al catálogo.', [['catalog', 'Ver productos'], ['human', 'Hablar con SCALA']]);
  const count = Math.ceil(items.length / 8);
  page = Math.max(0, Math.min(count - 1, page));
  const rows = items.slice(page * 8, page * 8 + 8).map(p => ({ id: 'product:' + p.id, title: p.title.slice(0, 24), description: p.format.slice(0, 72) || 'Consultar información' }));
  if (page + 1 < count) rows.push({ id: `catalog:${category || 'all'}:${page + 1}`, title: 'Más productos', description: 'Ver la siguiente página' });
  rows.push({ id: 'human', title: 'Hablar con SCALA', description: 'Consulta precios, entrega y disponibilidad' });
  return { type: 'interactive', interactive: { type: 'list', body: { text: '🌿 Productos de SCALA\nElige uno para ver su información. El equipo confirma disponibilidad y condiciones de compra.' }, action: { button: 'Elegir producto', sections: [{ title: 'Consultar productos', rows }] } } };
}

// Pure business logic. No client messages are sent to an AI service.
export function decideReply(input, session, catalog, now = Date.now()) {
  const n = normalize(input), exact = value => n === value;
  const next = { productId: session.product_id || null, handoffUntil: session.handoff_until || 0, stopped: !!session.stopped };
  const result = reply => ({ reply, next });
  const selected = () => catalog.products.find(p => p.id === next.productId);
  const handoff = text => { next.handoffUntil = now + 86400000; return result({ type: 'text', text: { preview_url: false, body: text + '\n\nPauso las respuestas automáticas para que puedas hablar con el equipo. Para volver al bot, escribe MENÚ.' } }); };
  const restart = ['menu', 'inicio', 'activar', 'activar bot', 'bot'].some(exact);
  if (restart) { next.handoffUntil = 0; next.stopped = false; return result(mainMenu()); }
  if (next.stopped) return result(null);
  if (/^(baja|stop|parar|detener|cancelar bot|no me escribas|no me escriban|no mas mensajes)$/.test(n)) {
    next.stopped = true;
    return result({ type: 'text', text: { preview_url: false, body: 'Entendido. He pausado las respuestas automáticas. Si deseas reactivarlas, escribe MENÚ.' } });
  }
  if (next.handoffUntil > now) return result(null);
  if (n === '__attachment__') return handoff('Tu mensaje incluye un archivo o audio. El bot no revisa su contenido; puedes explicar aquí tu consulta al equipo de SCALA.');
  if (n === 'human' || /\b(persona|humano|asesor|asesora|vendedor|equipo|reclamo|reembolso)\b/.test(n)) return handoff('Continúa tu consulta en este chat para que el equipo de SCALA pueda atenderte.');
  if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches|hello|hi)[!. 🌿😊]*$/.test(n)) return result(mainMenu());
  const list = /^catalog:(all|books|music):(\d{1,2})$/.exec(n);
  if (list) return result(productList(catalog, list[1] === 'all' ? null : list[1], Number(list[2])));
  if (n === 'catalog' || /\b(catalogo|productos|tienda)\b/.test(n)) return result(productList(catalog));
  if (/\b(musica|alabanza|alabanzas|canciones)\b/.test(n)) return result(productList(catalog, 'music'));
  if (n === 'books' || /\b(cuentos|libros)\b/.test(n)) return result(productList(catalog, 'books'));
  const named = catalog.products.find(p => n === 'product:' + p.id || [p.title, ...p.aliases].some(a => { const q = normalize(a); return q.length >= 4 && n.includes(q); }));
  if (named) next.productId = named.id;
  if (n === 'buy' || /\b(comprar|compra|pedido|pedir|quiero comprar)\b/.test(n)) {
    const p = selected();
    if (!p) return result(productList(catalog));
    return handoff(`Te interesa *${p.title}*. Escribe aquí tu consulta de compra; el equipo confirmará el precio vigente, disponibilidad y forma de pago. Esta consulta no confirma un pedido ni un pago.`);
  }
  if (/\b(precio|precios|cuanto|costo|costos|vale|cuesta)\b/.test(n)) {
    const p = selected();
    if (p?.price) return result(productReply(p));
    return handoff(p ? `Para *${p.title}*, el precio vigente debe confirmarlo el equipo de SCALA.` : 'El equipo de SCALA te ayudará a confirmar los precios. Indica qué producto te interesa.');
  }
  if (named) return result(productReply(named));
  if (/\b(pago|pagos|pagar|transferencia|qr|deposito)\b/.test(n)) return catalog.paymentInstructions ? result(buttons(catalog.paymentInstructions, [['human', 'Hablar con SCALA'], ['catalog', 'Ver productos']])) : handoff('El equipo de SCALA confirmará el medio de pago para tu compra. El bot no solicita datos bancarios ni confirma pagos.');
  if (/\b(entrega|envio|descargar|descarga|recibir)\b/.test(n)) {
    const p = selected();
    return p?.delivery ? result(buttons(p.delivery, [['human', 'Hablar con SCALA'], ['catalog', 'Ver productos']])) : handoff('El equipo de SCALA confirmará cómo recibir el producto y el tiempo de entrega. Indica qué producto te interesa.');
  }
  if (/\b(pdf|formato|digital)\b/.test(n)) return result(buttons('Un cuento en PDF es un archivo digital que puedes leer en un celular, tableta o computadora con un lector de PDF. Consulta la ficha de cada producto para confirmar su formato.', [['catalog', 'Ver productos'], ['human', 'Hablar con SCALA']]));
  if (/\b(web|pagina|enlace|link)\b/.test(n)) return result(buttons('Puedes visitar la web de SCALA:\n' + catalog.website, [['catalog', 'Ver productos'], ['human', 'Hablar con SCALA']]));
  if (/\b(gracias|thank)\b/.test(n)) return result(buttons('¡Gracias por escribir a SCALA! 🌿 ¿Te ayudo a consultar otro producto?', [['catalog', 'Ver productos'], ['human', 'Hablar con SCALA']]));
  return result(buttons('Puedo ayudarte a consultar productos, formato, precio, pago y entrega. Si tu consulta necesita una persona, elige Hablar con SCALA.', [['catalog', 'Ver productos'], ['buy', 'Cómo comprar'], ['human', 'Hablar con SCALA']]));
}
