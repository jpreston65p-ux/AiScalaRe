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
export function mainMenu() { return buttons('¡Hola! Qué gusto tenerte en *SCALA* 🌿\nSoy la asistente virtual de SCALA. Te ayudo a conocer nuestros productos y consultar con el equipo.\n\n*¿Qué te gustaría hacer?*', [['catalog', 'Ver productos'], ['buy', 'Cómo comprar'], ['human', 'Hablar con SCALA']]); }
function productReply(product) {
  const price = product.price ? `${product.price.currency} ${product.price.amount.toFixed(2)}` : 'A confirmar con el equipo de SCALA.';
  const icon = product.category === 'music' ? '🎵' : '📘';
  const text = `${icon} *${product.title}*\n📄 ${product.format}\n\n${product.description}\n\n*Precio:* ${price}${product.delivery ? '\n*Entrega:* ' + product.delivery : ''}${product.url ? '\n\n' + product.url : ''}`;
  return buttons(text, [['buy', 'Quiero comprar'], ['catalog', 'Ver productos'], ['human', 'Hablar con SCALA']]);
}
function productList(catalog, category = null, page = 0) {
  const items = category ? catalog.products.filter(p => p.category === category) : catalog.products;
  if (!items.length) return buttons('Por ahora no hay productos de esta categoría en el catálogo 🌿\nPuedes explorar los demás productos o consultar con el equipo de SCALA.', [['catalog', 'Ver productos'], ['human', 'Hablar con SCALA']]);
  const count = Math.ceil(items.length / 8);
  page = Math.max(0, Math.min(count - 1, page));
  const rows = items.slice(page * 8, page * 8 + 8).map(p => ({ id: 'product:' + p.id, title: p.title, description: p.format.slice(0, 72) || 'Ver detalles' }));
  if (page + 1 < count) rows.push({ id: `catalog:${category || 'all'}:${page + 1}`, title: 'Más productos', description: 'Ver la siguiente página' });
  rows.push({ id: 'human', title: 'Hablar con SCALA', description: 'Te ayudamos con tus dudas y tu compra' });
  return { type: 'interactive', interactive: { type: 'list', body: { text: '🌿 *Descubre los productos de SCALA*\nElige el que te interese para conocer sus detalles:' }, action: { button: 'Elegir producto', sections: [{ title: 'Consultar productos', rows }] } } };
}

// Pure business logic. No client messages are sent to an AI service.
export function decideReply(input, session, catalog, now = Date.now()) {
  const n = normalize(input), exact = value => n === value;
  const next = { productId: session.product_id || null, handoffUntil: session.handoff_until || 0, stopped: !!session.stopped };
  const result = reply => ({ reply, next });
  const selected = () => catalog.products.find(p => p.id === next.productId);
  const handoff = text => { next.handoffUntil = now + 86400000; return result({ type: 'text', text: { preview_url: false, body: text + '\n\nDejo mis respuestas en pausa para que puedas conversar con el equipo. Para volver a las opciones, escribe *MENÚ*.' } }); };
  const restart = ['menu', 'inicio', 'activar', 'activar bot', 'bot'].some(exact);
  if (restart) { next.handoffUntil = 0; next.stopped = false; return result(mainMenu()); }
  if (next.stopped) return result(null);
  if (/^(baja|stop|parar|detener|cancelar bot|no me escribas|no me escriban|no mas mensajes)$/.test(n)) {
    next.stopped = true;
    return result({ type: 'text', text: { preview_url: false, body: 'Listo 🌿 He desactivado mis respuestas para este chat.\nSi quieres retomarlas, escribe *MENÚ*.' } });
  }
  if (next.handoffUntil > now) return result(null);
  if (n === '__attachment__') return handoff('Gracias por enviar tu archivo o audio 🌿\nComo asistente virtual, no puedo revisarlo. El equipo de SCALA puede ayudarte; si quieres, añade una breve explicación por escrito.');
  if (n === 'human' || /\b(persona|humano|asesor|asesora|vendedor|equipo|reclamo|reembolso)\b/.test(n)) return handoff('Claro 🌿 Puedes hablar con el equipo de SCALA por este mismo chat.\nCuéntanos qué necesitas y qué producto te interesa, si tu consulta es sobre una compra.');
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
    return handoff(`¡Te ayudamos con tu compra! 🌿\nTe interesa *${p.title}*.\n\nDéjanos tu consulta aquí. El equipo de SCALA puede orientarte sobre el precio vigente, la disponibilidad y cómo pagar.`);
  }
  if (/\b(precio|precios|cuanto|costo|costos|vale|cuesta)\b/.test(n)) {
    const p = selected();
    if (p?.price) return result(productReply(p));
    return handoff(p ? `El precio vigente debe confirmarlo el equipo de SCALA 🌿\nPuedes preguntar aquí por *${p.title}*.` : 'Con gusto te ayudamos a consultar el precio 🌿\nDinos qué producto te interesa para que el equipo de SCALA pueda confirmártelo.');
  }
  if (named) return result(productReply(named));
  if (/\b(pago|pagos|pagar|transferencia|qr|deposito)\b/.test(n)) return catalog.paymentInstructions ? result(buttons(catalog.paymentInstructions, [['human', 'Hablar con SCALA'], ['catalog', 'Ver productos']])) : handoff('Para indicarte cómo pagar, el equipo de SCALA debe confirmar el medio de pago 🌿\nDéjanos aquí qué producto te interesa.');
  if (/\b(entrega|envio|descargar|descarga|recibir)\b/.test(n)) {
    const p = selected();
    return p?.delivery ? result(buttons(p.delivery, [['human', 'Hablar con SCALA'], ['catalog', 'Ver productos']])) : handoff('El equipo de SCALA puede explicarte cómo recibir tu producto y confirmar el tiempo de entrega 🌿\nDinos qué producto te interesa.');
  }
  if (/\b(pdf|formato|digital)\b/.test(n)) return result(buttons('📄 Un cuento en PDF es un archivo digital.\nPuedes leerlo en tu celular, tableta o computadora con un lector de PDF.\n\nEl formato de cada producto aparece en su ficha.', [['catalog', 'Ver productos'], ['human', 'Hablar con SCALA']]));
  if (/\b(web|pagina|enlace|link)\b/.test(n)) return result(buttons('🌐 Conoce más de SCALA en nuestra página:\n\n' + catalog.website, [['catalog', 'Ver productos'], ['human', 'Hablar con SCALA']]));
  if (/\b(gracias|thank)\b/.test(n)) return result(buttons('¡Con gusto! 🌿 Gracias por escribir a SCALA.\n¿Te ayudo a conocer otro producto?', [['catalog', 'Ver productos'], ['human', 'Hablar con SCALA']]));
  return result(buttons('Quiero ayudarte 🌿\nPuedo mostrarte nuestros productos o darte información sobre su formato y compra.\n\nSi prefieres atención personal, elige *Hablar con SCALA*.', [['catalog', 'Ver productos'], ['buy', 'Cómo comprar'], ['human', 'Hablar con SCALA']]));
}
