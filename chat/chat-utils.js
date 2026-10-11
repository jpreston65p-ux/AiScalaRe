(function (root) {
  'use strict';
  function safeLink(value) {
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; }
    catch { return null; }
  }
  function inline(parent, value, depth = 0) {
    if (depth > 4) { parent.append(document.createTextNode(value)); return; }
    const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\([^\s)]+\))/g;
    let previous = 0, match;
    while ((match = pattern.exec(value))) {
      parent.append(document.createTextNode(value.slice(previous, match.index)));
      const token = match[0]; let element;
      if (token.startsWith('`')) { element = document.createElement('code'); element.textContent = token.slice(1, -1); }
      else if (token.startsWith('**')) { element = document.createElement('strong'); inline(element, token.slice(2, -2), depth + 1); }
      else if (token.startsWith('*')) { element = document.createElement('em'); inline(element, token.slice(1, -1), depth + 1); }
      else {
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token), url = safeLink(link[2]);
        if (url) { element = document.createElement('a'); element.href = url; element.target = '_blank'; element.rel = 'noopener noreferrer'; element.textContent = link[1]; }
        else { element = document.createTextNode(token); }
      }
      parent.append(element); previous = pattern.lastIndex;
    }
    parent.append(document.createTextNode(value.slice(previous)));
  }
  function renderMarkdown(value) {
    const fragment = document.createDocumentFragment(), lines = value.replace(/\r\n/g, '\n').split('\n');
    let i = 0;
    const structural = text => /^(?:#{1,6}\s|```|~~~|>\s?|[-*+]\s|\d+[.)]\s)/.test(text);
    const cells = row => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(x => x.trim());
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      const fence = /^(\x60{3,}|~{3,})(.*)$/.exec(line);
      if (fence) {
        const codeLines = [], marker = fence[1][0]; i++;
        while (i < lines.length && !lines[i].startsWith(marker.repeat(3))) codeLines.push(lines[i++]);
        if (i < lines.length) i++;
        const wrapper = document.createElement('div'), header = document.createElement('div'), label = document.createElement('span'), copy = document.createElement('button'), pre = document.createElement('pre'), code = document.createElement('code');
        wrapper.className = 'code-block'; header.className = 'code-header'; label.textContent = fence[2].trim().slice(0, 30) || 'Texto'; copy.type = 'button'; copy.textContent = 'Copiar código';
        code.textContent = codeLines.join('\n');
        copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(code.textContent); copy.textContent = 'Copiado'; } catch { copy.textContent = 'Selecciona y copia'; } });
        header.append(label, copy); pre.append(code); wrapper.append(header, pre); fragment.append(wrapper); continue;
      }
      const heading = /^(#{1,6})\s+(.+)$/.exec(line);
      if (heading) { const element = document.createElement(heading[1].length <= 2 ? 'h3' : 'h4'); inline(element, heading[2]); fragment.append(element); i++; continue; }
      if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) { fragment.append(document.createElement('hr')); i++; continue; }
      if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1])) {
        const wrap = document.createElement('div'), table = document.createElement('table'), head = document.createElement('thead'), body = document.createElement('tbody'), row = document.createElement('tr');
        wrap.className = 'table-wrap';
        cells(line).forEach(cell => { const th = document.createElement('th'); inline(th, cell); row.append(th); }); head.append(row); i += 2;
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { const tr = document.createElement('tr'); cells(lines[i++]).forEach(cell => { const td = document.createElement('td'); inline(td, cell); tr.append(td); }); body.append(tr); }
        table.append(head, body); wrap.append(table); fragment.append(wrap); continue;
      }
      if (/^>/.test(line)) {
        const quote = document.createElement('blockquote');
        while (i < lines.length && /^>/.test(lines[i])) { if (quote.childNodes.length) quote.append(document.createElement('br')); inline(quote, lines[i++].replace(/^>\s?/, '')); }
        fragment.append(quote); continue;
      }
      const list = /^\s*(?:([-*+])\s+|(\d+)[.)]\s+)(.*)$/.exec(line);
      if (list) {
        const ordered = !!list[2], element = document.createElement(ordered ? 'ol' : 'ul');
        if (ordered) element.start = Math.min(999, Number(list[2]));
        while (i < lines.length) { const row = /^\s*(?:([-*+])\s+|(\d+)[.)]\s+)(.*)$/.exec(lines[i]); if (!row || !!row[2] !== ordered) break; const li = document.createElement('li'); inline(li, row[3]); element.append(li); i++; }
        fragment.append(element); continue;
      }
      const paragraph = document.createElement('p');
      do { if (paragraph.childNodes.length) paragraph.append(document.createElement('br')); inline(paragraph, lines[i++]); }
      while (i < lines.length && lines[i].trim() && !structural(lines[i]) && !(lines[i].includes('|') && i + 1 < lines.length && /\|?\s*:?-{3,}/.test(lines[i + 1])));
      fragment.append(paragraph);
    }
    return fragment;
  }
  async function readEvents(response, onEvent) {
    if (!response.body) throw new Error('Tu navegador no permite recibir esta respuesta en tiempo real. Actualízalo.');
    const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
    const dispatch = line => { if (!line.trim()) return; const event = JSON.parse(line); if (!event || typeof event.type !== 'string') throw new Error('La respuesta no tiene el formato esperado.'); onEvent(event); };
    try {
      while (true) { const chunk = await reader.read(); if (chunk.done) break; buffer += decoder.decode(chunk.value, { stream: true }); if (buffer.length > 1048576) throw new Error('La respuesta es demasiado grande.'); let boundary; while ((boundary = buffer.indexOf('\n')) !== -1) { dispatch(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 1); } }
      buffer += decoder.decode(); if (buffer.trim()) dispatch(buffer);
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
  function normalizeConversations(value) {
    if (!Array.isArray(value)) throw new Error('El archivo no contiene conversaciones.');
    const result = [], seen = new Set();
    for (const item of value.slice(0, 100)) {
      if (!item || typeof item.id !== 'string' || !Array.isArray(item.messages)) continue;
      const messages = item.messages.filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && m.content.trim()).slice(-100).map(m => ({ role: m.role, content: m.content.slice(0, m.role === 'user' ? 6000 : 24000), partial: !!m.partial, mode: ['fast', 'advanced'].includes(m.mode) ? m.mode : 'fast', model: typeof m.model === 'string' ? m.model.slice(0, 100) : '', savedAt: typeof m.savedAt === 'string' ? m.savedAt : '' }));
      if (!messages.some(m => m.role === 'user')) continue;
      const id = item.id.slice(0, 100); if (seen.has(id)) continue; seen.add(id);
      result.push({ id, title: typeof item.title === 'string' ? item.title.slice(0, 80) : messages.find(m => m.role === 'user').content.slice(0, 65), updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(), messages });
    }
    return result;
  }
  function validateStatus(value, version) {
    if (!value || value.app !== 'scala-ai-public' || value.provider !== 'gemini' || value.version !== version) {
      throw new Error('Recarga esta página para abrir la versión actual de SCALA AI.');
    }
    if (typeof value.configured !== 'boolean' || typeof value.token !== 'string' || !value.token) {
      throw new Error('No se pudo comprobar la conexión de Gemini. Recarga la página.');
    }
    return value;
  }
  const api = { safeLink, renderMarkdown, readEvents, normalizeConversations, validateStatus };
  root.SCALA_UTILS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
