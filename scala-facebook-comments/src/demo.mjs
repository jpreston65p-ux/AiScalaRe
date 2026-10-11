import { createInterface } from 'node:readline';
import { loadConfig } from './config.mjs';
import { decideReply } from './catalog.mjs';
import { renderReply } from './processor.mjs';

const { catalog } = loadConfig({ live: false });
const terminal = createInterface({ input: process.stdin, output: process.stdout });
let state = {}, options = {};
console.log('SCALA · prueba local de mensajes. No conecta ni envía mensajes a Facebook.\nEscribe SALIR para cerrar.');
try {
  process.stdout.write('\nCliente: ');
  for await (const line of terminal) {
    const text = line.trim();
    if (/^salir$/i.test(text)) break;
    if (!text) { process.stdout.write('\nCliente: '); continue; }
    const result = decideReply(options[text] || text, state, catalog);
    const output = renderReply(result.reply), next = result.next;
    state = { product_id: next.productId, handoff_until: next.handoffUntil, stopped: next.stopped, welcomed: next.welcomed, formal: next.formal, awaiting_receipt: next.awaitingReceipt, receipt_received: next.receiptReceived, hours_notice_key: next.hoursNoticeKey };
    options = output.options;
    console.log('\nSCALA: ' + (output.text || '(Respuestas en pausa; escribe MENÚ para reactivarlas.)'));
    process.stdout.write('\nCliente: ');
  }
} catch (error) { if (error.code !== 'ERR_USE_AFTER_CLOSE') throw error; }
finally { terminal.close(); }
