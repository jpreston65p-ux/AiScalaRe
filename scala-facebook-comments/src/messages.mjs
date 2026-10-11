// Adapt wording before inserting confirmed facts, so names and URLs stay intact.
const formalWords = new Map([
  ['tú', 'usted'], ['tu', 'su'], ['tus', 'sus'], ['te', 'le'],
  ['puedes', 'puede'], ['quieres', 'quiere'], ['necesitas', 'necesita'],
  ['buscas', 'busca'], ['prefieres', 'prefiere'], ['cuentas', 'cuenta'],
  ['disfrutes', 'disfrute'], ['escribe', 'escriba'], ['deja', 'deje'],
  ['envía', 'envíe'], ['envíanos', 'envíenos'], ['escríbenos', 'escríbanos'],
  ['cuéntanos', 'cuéntenos'], ['dinos', 'díganos'], ['añade', 'añada'],
  ['ayudarte', 'ayudarle'], ['compartirte', 'compartirle'], ['orientarte', 'orientarle'],
  ['darte', 'darle'], ['indicarte', 'indicarle'], ['prefieras', 'prefiera'],
]);
export function customerText(template, values = {}, formal = false) {
  if (formal) template = template.replace(/\p{L}+/gu, word => {
    const replacement = formalWords.get(word.toLowerCase());
    if (!replacement) return word;
    return word[0] === word[0].toUpperCase() ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
  });
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(values[key] ?? ''));
}
export const withoutEmoji = template => template.replace(/\p{Extended_Pictographic}\uFE0F?/gu, '').replace(/ +\n/g, '\n').replace(/ +([.!?])/g, '$1');
export const messages = {
  welcome: '¡Hola! 😊 Bienvenido a SCALA. Soy tu asistente virtual y estoy aquí para ayudarte.\n\nPuedes preguntarme por nuestros productos, cómo comprar o solicitar atención de una persona. ¿Qué te gustaría conocer? 💙',
  initial: '¡Hola! Soy tu asistente virtual de SCALA.\n\n',
  greeting: '¡Hola! Qué gusto saludarte 😊 ¿Buscas información sobre nuestro cuento o necesitas ayuda con tu compra?',
  products: '📖 Conoce «{{title}}», nuestro cuento digital en PDF: {{description}}\n\n¿Te gustaría conocer su precio o cómo comprarlo?\n\nTambién puedes visitar nuestra página: {{website}} 💙',
  description: '«{{title}}» está basado en la historia de Jueces 6 y 7 📖✨.\n\nAcompaña a Gedeón mientras aprende a confiar en Dios y enfrentar sus temores. Su formato es digital PDF para disfrutarlo en familia.',
  price: 'El cuento digital «{{title}}» cuesta {{price}}.',
  missingPrice: 'Necesito confirmar el precio actual para darte el dato correcto. Puedes solicitar atención del equipo de SCALA por este chat.',
  missingPayment: 'Los métodos y datos de pago deben confirmarse antes de indicarte cómo pagar. Puedes consultar al equipo de SCALA por este chat.',
  payment: 'Puedes realizar el pago mediante {{methods}}.\n\nEstos son los datos:\n{{details}}\n\nDespués, envíanos tu comprobante por este chat para verificarlo y continuar con la entrega de tu producto.',
  paidWithoutReceipt: 'Gracias por avisarnos 😊. ¿Puedes enviar tu comprobante por este chat para que se pueda verificar el pago?',
  receipt: '¡Gracias por enviar tu comprobante! 😊 El pago queda pendiente de verificación.\n\nLa entrega podrá continuar cuando se confirme el pago 💙.',
  pendingPayment: 'No tengo una confirmación de pago disponible. El equipo de SCALA debe verificarlo antes de autorizar la entrega.',
  delivery: '¡Tu pago está confirmado! 🎉 Aquí tienes «{{title}}»:\n\n{{downloadUrl}}\n\nGracias por elegir SCALA 💙. Si tienes dificultades para abrirlo o descargarlo, escríbenos y te ayudamos.',
  pendingDelivery: 'Tu pago está confirmado. La entrega está pendiente: el equipo de SCALA necesita disponer del archivo o enlace y autorizar su envío.',
  missingDelivery: 'Necesito confirmar cómo recibir el producto y el tiempo de entrega. Puedes solicitar atención del equipo de SCALA por este chat.',
  format: 'Un cuento en PDF es un archivo digital. Puedes leerlo en un celular, tableta o computadora con un lector de PDF. «{{title}}» tiene este formato; no es un producto físico.',
  unknown: '¿Me cuentas un poquito más para poder ayudarte? 😊\n\nPuedes preguntarme por el cuento, su precio, cómo comprarlo o la entrega. También puedes solicitar atención de una persona.',
  human: 'Claro 😊. Deja aquí tu consulta para que una persona del equipo de SCALA pueda ayudarte cuando esté disponible.\n\nSi se trata de una compra, cuéntanos qué dificultad tienes 💙.',
  paused: 'Mis respuestas automáticas quedan en pausa. Para volver a las opciones, escribe MENÚ.',
  attachment: 'Recibí tu archivo o audio. Como asistente virtual no puedo revisar su contenido. Puedes añadir una explicación por escrito o solicitar atención del equipo de SCALA.',
  outsideHours: '¡Gracias por escribir a SCALA! En este momento nuestro equipo está fuera del horario de atención.\n\nAtendemos {{hours}}. Puedes dejar tu consulta aquí para que el equipo la revise cuando retome la atención.',
  missingHours: 'Necesito confirmar los días y el horario de atención del equipo de SCALA.',
  goodbye: '¡Gracias por escribirnos! 😊 Que disfrutes de momentos bonitos y nuevas historias en familia.\n\nCuando necesites ayuda, puedes volver a este chat 💙.\n\nSCALA, para una vida edificada.',
  thanks: '¡Con mucho gusto! 😊 Gracias por visitar SCALA 💙.',
  stopped: 'Listo. He desactivado mis respuestas para este chat. Si quieres retomarlas, escribe MENÚ.',
};
