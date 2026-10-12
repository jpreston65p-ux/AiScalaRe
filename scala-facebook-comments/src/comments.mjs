import {normalize} from './catalog.mjs';
import {customerText} from './messages.mjs';

// Public replies only identify the assistant and invite the visitor to SCALA's
// confirmed WhatsApp. Product and purchase data stay out of public comments.
export function publicCommentReply(input,catalog,{formal=false}={}) {
  const text=normalize(typeof input==='string' ? input.slice(0,2000) : '');
  if(!text || /^https?:\/\/\S+$/.test(text))return null;
  if(/^(baja|stop|parar|detener|no me respondas|no mas respuestas)[.!]*$/.test(text))return {text:'De acuerdo. Pausaré las respuestas automáticas a tus comentarios.',stop:true};
  const contact=catalog.whatsapp;
  const invitation='¡Hola! 😊 Soy el asistente virtual de SCALA.\n\nSi quieres saber más sobre el producto, escríbenos por WhatsApp 💙.';
  return {text:customerText(invitation,{},formal)+(contact ? `\n\nWhatsApp: ${contact.number}\n${contact.url}` : ''),stop:false};
}
