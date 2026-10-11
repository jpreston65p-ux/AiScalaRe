import { createInterface } from 'node:readline';
import { loadConfig } from './config.mjs';
import { publicCommentReply } from './comments.mjs';
const { catalog } = loadConfig({ live: false });
console.log('SCALA · demo de comentarios públicos. No conecta ni publica respuestas en Facebook.');
console.log('Escribe un comentario para probar la respuesta. SALIR: terminar.');
const lines = createInterface({ input: process.stdin, terminal: process.stdin.isTTY === true });
for await (const line of lines) {
  if (line.trim().toUpperCase() === 'SALIR') break;
  const reply = publicCommentReply(line, catalog);
  console.log(reply?.text || '(Sin respuesta automática: comentario sin consulta identificable.)');
}
