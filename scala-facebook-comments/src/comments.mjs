import { normalize } from './catalog.mjs';
import { customerText } from './messages.mjs';
import { hoursStatus } from './hours.mjs';

// A public comment never exposes an order, a receipt, bank details or a
// download authorized for one customer. This policy is separate from chats.
export function publicCommentReply(input, catalog, { productId = null, formal = false, requireProductContext = false } = {}) {
  const text = normalize(typeof input === 'string' ? input.slice(0, 2000) : '');
  if (!text) return null;
  if (/^https?:\/\/\S+$/.test(text)) return null;
  if (/^(baja|stop|parar|detener|no me respondas|no mas respuestas)[.!]*$/.test(text)) return { text: 'De acuerdo. Pausaré las respuestas automáticas a tus comentarios.', stop: true };
  const named = catalog.products.find(p => [p.title, ...p.aliases].some(alias => normalize(alias).length >= 4 && text.includes(normalize(alias))));
  const product = named || catalog.products.find(p => p.id === productId) || ((!requireProductContext || /\b(catalogo|productos)\b/.test(text)) && catalog.products.length === 1 ? catalog.products[0] : null);
  const price = /\b(precio|precios|cuanto|costo|vale|cuesta|cuestan)\b/.test(text);
  const format = /\b(pdf|formato|digital|fisico|fisica|impreso|papel)\b/.test(text);
  const buy = /\b(comprar|compra|conseguir|pedido|adquirir)\b|\bquiero (?:uno|el cuento|el libro)\b|\bme interesa (?:comprarlo|el cuento|el libro)\b/.test(text);
  const payment = /\b(pago|pagar|pague|pagado|comprobante|recibo|transferencia|tarjeta|deposite)\b/.test(text);
  const delivery = /\b(entrega|descarga|descargar|enviar|envio|recibir|recibi|abrir)\b/.test(text);
  const human = /\b(humano|humana|asesor|asesora|reembolso|reclamo)\b|hablar.*(?:persona|equipo)/.test(text);
  const unknown = /\b(edad|edades|paginas|promocion|descuento|actividades|colorear|pack|paquete|materiales)\b/.test(text);
  const hoursAsked = /\b(horario|horarios|atienden|abren|abierto)\b/.test(text);
  const website = /\b(pagina|web|sitio|link|enlace)\b/.test(text) && !payment && !delivery;
  const appreciation = /\b(gracias|hermoso|hermosa|bonito|bonita|me encanta|me gusto|excelente|amen)\b/.test(text);
  const description = /\b(informacion|info|detalles|trata|historia|contenido|biblia|jueces|productos|catalogo)\b/.test(text)
    || !!named && ![price,format,buy,payment,delivery,human,unknown,hoursAsked,website,appreciation].some(Boolean)
    || /\b(cuento|libro)\b/.test(text) && ![price,format,buy,payment,delivery,human,unknown,hoursAsked,website,appreciation].some(Boolean);
  const parts = [];
  if (!product && (description || format || price)) parts.push('¿De qué producto de SCALA te gustaría conocer los detalles? 😊');
  if (description && product) parts.push(`📖 «${product.title}»\n${product.description}${!format && product.format ? `\nFormato: ${product.format}.` : ''}`);
  if (format && product) parts.push(`«${product.title}» se entrega en formato ${product.format || 'pendiente de confirmar con el equipo de SCALA'}.`);
  if (price && product) parts.push(product.price ? `«${product.title}» cuesta ${product.price.currency} ${product.price.amount.toFixed(2)} 😊.` : `Necesito confirmar el precio actual de «${product.title}» con el equipo de SCALA 😊.`);
  if (unknown) parts.push('Esas características o condiciones necesitan confirmación del equipo de SCALA.');
  if (payment || delivery || human) parts.push('Escríbenos por mensaje privado para consultar tu compra. Evita publicar comprobantes o datos personales en los comentarios.');
  else if (buy) parts.push(`¡Con gusto! Puedes escribirnos por mensaje privado para consultar cómo comprar${product ? ` «${product.title}»` : 'lo'} 💙.`);
  if (website) parts.push(`Nuestra página: ${catalog.website}`);
  if (hoursAsked) {
    const hours = hoursStatus(catalog.attentionHours, Date.now());
    parts.push(hours ? `El horario de atención es ${hours.text}.` : 'Necesito confirmar el horario de atención con el equipo de SCALA.');
  }
  if (!parts.length && appreciation) parts.push('¡Gracias por compartir tu comentario! 💙');
  if (!parts.length && /^(hola|buenas|buenos dias|buenas tardes|buenas noches)[.! 😊💙]*$/.test(text)) parts.push('¡Hola! 😊 Qué gusto saludarte. ¿Qué te gustaría conocer sobre los productos de SCALA?');
  if (!parts.length && /[?¿]/.test(input)) parts.push('¿Puedes aclarar qué necesitas saber sobre SCALA?');
  if (!parts.length) parts.push('¡Gracias por escribirnos! 💙\nPuedes preguntarnos por los productos de SCALA cuando lo necesites.');
  // Even a comment asking several questions stays within the brand's 2-emoji limit.
  let emojiCount = 0;
  const body = parts.join('\n\n').replace(/[😊💙📖]/gu, emoji => ++emojiCount <= 2 ? emoji : '').replace(/ +\./g, '.');
  return { text: customerText(`✦ SCALA · asistente virtual ✦\n\n${body}`, {}, formal), stop: false };
}
