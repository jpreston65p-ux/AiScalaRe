(() => {
  'use strict';
  const BUILD = '3.0.0';
  const API_BASE = document.documentElement.dataset.apiBase || '';
  const apiURL = path => API_BASE + path;
  const $ = id => document.getElementById(id), U = window.SCALA_UTILS;
  const keys = { chats: 'scala-ai-conversations-v1', prefs: 'scala-ai-preferences-v1', library: 'scala-ai-library-v1', active: 'scala-ai-active-v2' };
  const input = $('message-input'), messages = $('messages'), workspace = $('workspace'), settings = $('settings');
  let chats = [], library = [], prefs = {}, activeId = null, pending = null, attachment = null, sessionToken = '', configured = false, loading = true, cooldownUntil = 0, toastTimer, drawerOpener, renderFrame, action = null;
  function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
  try { chats = U.normalizeConversations(read(keys.chats, [])); } catch {}
  prefs = read(keys.prefs, {}); if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) prefs = {};
  library = read(keys.library, []); if (!Array.isArray(library)) library = []; library = library.filter(x => x && typeof x.content === 'string' && x.content.length <= 24000 && typeof x.id === 'string').slice(0, 50);
  activeId = read(keys.active, null); if (!chats.some(c => c.id === activeId)) activeId = null;
  const uuid = () => window.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  const current = () => chats.find(c => c.id === activeId);
  function notify(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200); }
  function save() { try { localStorage.setItem(keys.chats, JSON.stringify(chats.slice(0, 100))); localStorage.setItem(keys.active, JSON.stringify(activeId)); localStorage.setItem(keys.library, JSON.stringify(library.slice(0, 50))); } catch { notify('El navegador no pudo guardar los cambios. Exporta tu historial para conservarlo.'); } }
  function resizeInput() { input.style.height = '2.7rem'; input.style.height = Math.min(input.scrollHeight, 112) + 'px'; }
  function applyPrefs() {
    const scale = [1, 1.12, 1.25].includes(Number(prefs.scale)) ? Number(prefs.scale) : 1;
    document.documentElement.style.setProperty('--reading-scale', scale);
    document.body.classList.toggle('high-contrast', !!prefs.contrast); document.body.classList.toggle('reduced-motion', !!prefs.motion);
    $('text-size').value = String(scale); $('high-contrast').checked = !!prefs.contrast; $('reduce-motion').checked = !!prefs.motion;
    $('response-style').value = ['brief', 'normal', 'detailed'].includes(prefs.style) ? prefs.style : 'normal';
    $('custom-instructions').value = typeof prefs.instructions === 'string' ? prefs.instructions.slice(0, 1500) : '';
    $('mode').value = prefs.mode === 'advanced' ? 'advanced' : 'fast';
  }
  function savePrefs() { prefs = { scale: Number($('text-size').value), contrast: $('high-contrast').checked, motion: $('reduce-motion').checked, style: $('response-style').value, instructions: $('custom-instructions').value, mode: $('mode').value }; applyPrefs(); try { localStorage.setItem(keys.prefs, JSON.stringify(prefs)); } catch { notify('No pudimos guardar tus preferencias.'); } updateControls(); }
  function button(label, onClick, className = 'mini-button') { const el = document.createElement('button'); el.type = 'button'; el.textContent = label; el.className = className; el.addEventListener('click', onClick); return el; }
  function status(text, error = false) { $('connection-note').textContent = text; $('connection-note').hidden = !text; $('connection-note').classList.toggle('is-error', error); }
  function updateControls() {
    const wait = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
    $('send').disabled = !pending && (loading || !configured || wait > 0);
    $('send').dataset.stop = String(!!pending); $('send').setAttribute('aria-label', pending ? 'Detener respuesta' : 'Enviar mensaje');
    $('send').querySelector('svg').innerHTML = pending ? '<rect x="6" y="6" width="12" height="12" rx="2"/>' : '<path d="M12 20V4m-7 7 7-7 7 7"/>';
    workspace.toggleAttribute('aria-busy', !!pending); if (pending) workspace.setAttribute('aria-busy', 'true');
    $('connection-status').textContent = loading ? 'Conectando…' : wait ? 'Pausa: ' + wait + ' s' : configured ? 'Lista para conversar' : 'Disponible pronto';
    $('connection-status').dataset.ready = String(configured && !wait);
    $('service-refresh').hidden = configured && !wait;
    $('mode-help').textContent = $('mode').value === 'advanced' ? 'Más capacidad para tareas complejas' : 'Respuestas ágiles para el día a día';
    const hasUser = !!current()?.messages.some(m => m.role === 'user');
    $('retry').hidden = !hasUser || !!pending;
    $('continue').hidden = !(current()?.messages.at(-1)?.role === 'assistant') || !!pending;
    $('mode').disabled = !!pending;
  }
  async function api(path, data, token = sessionToken) {
    const response = await fetch(apiURL(path), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SCALA-Token': token }, body: JSON.stringify(data) });
    let value; try { value = await response.json(); } catch { throw new Error('No pudimos leer la respuesta. Recarga la página.'); }
    if (!response.ok) { const error = new Error(value.error || 'No se pudo completar la operación.'); error.retryAfter = value.retryAfter; error.needsSetup = value.needsSetup; throw error; }
    return value;
  }
  async function refreshStatus() {
    try {
      const response = await fetch(apiURL('/api/status'), { cache: 'no-store', headers: sessionToken ? { 'X-SCALA-Token': sessionToken } : {} });
      if (!response.ok) throw new Error('No pudimos conectar con SCALA AI. Pulsa Comprobar conexión para reintentar.');
      const value = U.validateStatus(await response.json(), BUILD);
      sessionToken = value.token; configured = value.configured; cooldownUntil = Date.now() + (value.retryAfter || 0) * 1000;
      loading = false; updateControls(); if (!configured) status('SCALA AI se está preparando. Vuelve a visitarnos en un momento.'); else status(''); return true;
    }
    catch (error) { sessionToken = ''; loading = false; configured = false; updateControls(); $('send').disabled = true; status(error instanceof TypeError || error instanceof SyntaxError ? 'No pudimos conectar con SCALA AI. Comprueba Internet y pulsa Comprobar conexión.' : error.message, true); return false; }
  }
  function renderHistory() {
    const list = $('history-list'), query = $('history-search').value.trim().toLocaleLowerCase(); list.replaceChildren();
    $('history-empty').hidden = chats.length > 0; list.hidden = chats.length === 0;
    const found = chats.filter(c => (c.title || '').toLocaleLowerCase().includes(query) || c.messages.some(m => m.content.toLocaleLowerCase().includes(query)));
    $('history-no-results').hidden = !chats.length || !!found.length;
    for (const chat of found) {
      const li = document.createElement('li'), row = document.createElement('div'), main = button(chat.title || 'Conversación', () => { stopPending(); activeId = chat.id; attachment = null; save(); renderAll(); closeDrawer(); input.focus({ preventScroll: true }); }, 'history-item');
      row.className = 'history-row'; main.setAttribute('aria-current', String(chat.id === activeId));
      const edit = button('⋯', () => openAction(chat), 'history-menu'); edit.setAttribute('aria-label', 'Opciones de ' + chat.title);
      row.append(main, edit); li.append(row); list.append(li);
    }
  }
  function renderLibrary() {
    const list = $('library-list'); list.replaceChildren(); $('library-empty').hidden = !!library.length;
    for (const item of library) {
      const card = document.createElement('article'), title = document.createElement('h3'), summary = document.createElement('p'); card.className = 'library-card'; title.textContent = item.title || 'Respuesta guardada'; summary.textContent = item.content.slice(0, 130) + (item.content.length > 130 ? '…' : '');
      card.append(title, summary, button('Leer', () => { $('resource-title').textContent = item.title || 'Respuesta guardada'; $('resource-body').replaceChildren(U.renderMarkdown(item.content)); $('resource-dialog').showModal(); }), button('Quitar', () => { library = library.filter(x => x.id !== item.id); save(); renderLibrary(); })); list.append(card);
    }
  }
  async function copyText(text) { try { await navigator.clipboard.writeText(text); notify('Copiado.'); } catch { notify('No pudimos copiar. Selecciona el texto y usa Ctrl+C.'); } }
  function bookmark(chat, message, index) {
    const id = chat.id + ':' + index;
    if (library.some(x => x.id === id)) { notify('Esta respuesta ya está en tu biblioteca.'); return; }
    if (library.length >= 50) { notify('Tu biblioteca tiene 50 respuestas. Quita alguna para guardar otra.'); return; }
    library.unshift({ id, title: chat.title, content: message.content, createdAt: new Date().toISOString() }); save(); renderLibrary(); notify('Respuesta guardada en tu biblioteca.');
  }
  function messageNode(chat, message, index) {
    const item = document.createElement('li'), label = document.createElement('div'), body = document.createElement('div');
    item.className = 'message message-' + message.role; label.className = 'message-label'; body.className = 'message-body';
    label.textContent = message.role === 'user' ? 'Tú' : 'SCALA AI · ' + (message.mode === 'advanced' ? 'Avanzado' : 'Rápido');
    if (message.role === 'assistant' && message.partial && pending?.assistant !== message) label.textContent += ' · Parcial';
    if (pending?.assistant === message) { body.classList.add('is-streaming'); body.textContent = message.content || 'Preparando respuesta…'; }
    else if (message.role === 'assistant') body.append(U.renderMarkdown(message.content));
    else body.textContent = message.content;
    item.append(label, body);
    if (message.content) { const actions = document.createElement('div'); actions.className = 'message-actions'; actions.append(button('Copiar', () => copyText(message.content))); if (message.role === 'assistant' && !pending) actions.append(button('Guardar', () => bookmark(chat, message, index))); item.append(actions); }
    return item;
  }
  function renderChat(scroll = false) {
    const chat = current(), has = !!chat?.messages.length, nearBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 90;
    workspace.dataset.chat = String(has); $('ideas').hidden = has; messages.hidden = !has;
    const previousTop = messages.scrollTop;
    messages.replaceChildren(...(chat?.messages || []).map((m, i) => messageNode(chat, m, i)));
    if (scroll || nearBottom) messages.scrollTop = messages.scrollHeight; else messages.scrollTop = previousTop;
    updateControls();
  }
  function renderAttachment() { $('attachment-chip').hidden = !attachment; $('attachment-name').textContent = attachment ? attachment.name + ' · ' + attachment.text.length + ' caracteres' : ''; }
  function renderAll() { renderHistory(); renderLibrary(); renderChat(); renderAttachment(); }
  function queueStreamRender() {
    if (renderFrame) return;
    renderFrame = requestAnimationFrame(() => {
      renderFrame = null; if (!pending || current()?.id !== pending.chat.id) return;
      const body = messages.lastElementChild?.querySelector('.message-body'); if (!body) return;
      const atBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 90;
      body.textContent = pending.assistant.content;
      if (atBottom) messages.scrollTop = messages.scrollHeight;
    });
  }
  function openDrawer() { drawerOpener = document.activeElement; $('sidebar').dataset.open = 'true'; $('drawer-backdrop').hidden = false; $('sidebar-toggle').setAttribute('aria-expanded', 'true'); $('sidebar-close').focus(); }
  function closeDrawer() { const open = $('sidebar').dataset.open === 'true'; delete $('sidebar').dataset.open; $('drawer-backdrop').hidden = true; $('sidebar-toggle').setAttribute('aria-expanded', 'false'); if (open && drawerOpener) drawerOpener.focus({ preventScroll: true }); }
  function switchTab(tab) { for (const key of ['history', 'library']) { const selected = key === tab; $(key + '-tab').setAttribute('aria-selected', String(selected)); $(key + '-tab').tabIndex = selected ? 0 : -1; $(key + '-panel').hidden = !selected; } }
  function stopPending() {
    const record = pending; if (!record) return;
    record.cancelled = true; api('/api/cancel', { requestId: record.requestId }, record.token).catch(() => {}); record.controller.abort();
    if (!record.assistant.content) record.chat.messages = record.chat.messages.filter(m => m !== record.assistant);
    else record.assistant.partial = true;
    pending = null; save(); renderChat(); status('Respuesta detenida. Puedes seguir escribiendo.');
  }
  function newChat() { stopPending(); activeId = null; input.value = ''; attachment = null; resizeInput(); save(); renderAll(); status(''); switchTab('history'); closeDrawer(); input.focus({ preventScroll: true }); }
  function openAction(chat) { action = chat.id; $('chat-title').value = chat.title || 'Conversación'; $('action-feedback').textContent = ''; $('chat-delete').textContent = 'Eliminar conversación'; $('action-dialog').showModal(); }
  function handleError(error) { if (error.retryAfter) cooldownUntil = Math.max(cooldownUntil, Date.now() + error.retryAfter * 1000); if (error.needsSetup) configured = false; status(error.message || 'No se pudo completar la operación.', true); updateControls(); }
  async function sendConversation(chat) {
    const outgoing = chat.messages.filter(m => m.content).slice(-100).map(m => ({ role: m.role, content: m.content }));
    const assistant = { role: 'assistant', content: '', partial: true, mode: $('mode').value, savedAt: new Date().toISOString() };
    chat.messages.push(assistant); const record = { chat, assistant, requestId: uuid(), controller: new AbortController(), token: sessionToken, cancelled: false }; pending = record;
    renderChat(true); updateControls(); status('');
    let completed = false, lastSaved = 0;
    const timeout = setTimeout(() => { record.timeout = true; record.controller.abort(); }, 120000);
    try {
      const response = await fetch(apiURL('/api/chat'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SCALA-Token': record.token }, body: JSON.stringify({ messages: outgoing, requestId: record.requestId, mode: assistant.mode, style: $('response-style').value, instructions: $('custom-instructions').value }), signal: record.controller.signal });
      if (!response.ok) { let value; try { value = await response.json(); } catch { value = {}; } if (response.status === 403) { await refreshStatus(); throw new Error('La sesión se actualizó. Pulsa Reintentar para enviar tu mensaje.'); } const error = new Error(value.error || 'No recibimos la respuesta. Recarga SCALA AI.'); error.retryAfter = value.retryAfter; error.needsSetup = value.needsSetup; throw error; }
      await U.readEvents(response, event => {
        if (pending !== record || record.cancelled) return;
        if (event.type === 'meta') { assistant.model = event.model; if (event.contextTrimmed) status('La IA está usando los mensajes recientes. El historial completo sigue guardado.'); }
        if (event.type === 'delta') { assistant.content += event.text; queueStreamRender(); if (Date.now() - lastSaved > 900) { save(); lastSaved = Date.now(); } }
        if (event.type === 'done') { completed = true; assistant.partial = event.finishReason !== 'stop'; if (event.finishReason === 'length') status('Se alcanzó la longitud de esta respuesta. Pulsa Continuar para seguir.'); else if (event.finishReason !== 'stop') status('La respuesta terminó antes de completarse. Puedes reintentar.'); $('announcer').textContent = 'SCALA AI terminó su respuesta.'; }
        if (event.type === 'cancelled') { record.cancelled = true; }
        if (event.type === 'error') { const error = new Error(event.error); error.retryAfter = event.retryAfter; error.needsSetup = event.needsSetup; throw error; }
      });
      if (!completed && !record.cancelled) throw new Error('La conexión terminó antes de completar la respuesta. Puedes reintentar.');
    } catch (error) {
      if (pending === record && !record.cancelled) handleError(record.timeout ? new Error('La respuesta tardó más de dos minutos. Puedes reintentar.') : error.name === 'AbortError' ? new Error('La respuesta se interrumpió. Puedes reintentar.') : error);
    } finally {
      clearTimeout(timeout);
      if (!assistant.content) chat.messages = chat.messages.filter(m => m !== assistant);
      if (pending === record) { pending = null; save(); renderChat(); renderHistory(); updateControls(); }
    }
  }
  async function submit(event) {
    event.preventDefault(); if (pending) { stopPending(); return; }
    if (loading) return;
    if (cooldownUntil > Date.now()) { notify('Espera a que termine la pausa de Gemini.'); return; }
    if (!configured) { status('SCALA AI se está preparando. Vuelve a visitarnos en un momento.'); return; }
    let content = input.value.trim();
    if (attachment) content += '\n\n[DOCUMENTO ADJUNTO]\nNombre: ' + attachment.name + '\n' + attachment.text + '\n[/DOCUMENTO ADJUNTO]';
    if (!content.trim()) { input.focus(); return; }
    if (content.length > 6000) { notify('El mensaje y el documento juntos admiten hasta 6000 caracteres. Acorta el texto.'); return; }
    let chat = current();
    if (!chat) { chat = { id: uuid(), title: (input.value.trim() || attachment?.name || 'Conversación').slice(0, 65), updatedAt: new Date().toISOString(), messages: [] }; chats.unshift(chat); chats = chats.slice(0, 100); activeId = chat.id; }
    chat.messages.push({ role: 'user', content, savedAt: new Date().toISOString() }); chat.updatedAt = new Date().toISOString();
    input.value = ''; attachment = null; renderAttachment(); resizeInput(); save(); renderHistory(); await sendConversation(chat); input.focus({ preventScroll: true });
  }
  $('composer').addEventListener('submit', submit);
  $('retry').addEventListener('click', async () => {
    if (pending || cooldownUntil > Date.now()) return; if (!configured) { status('SCALA AI se está preparando. Vuelve a visitarnos en un momento.'); return; }
    const chat = current(); if (!chat) return;
    while (chat.messages.length && chat.messages.at(-1).role === 'assistant') chat.messages.pop();
    if (!chat.messages.length) return; save(); await sendConversation(chat);
  });
  $('continue').addEventListener('click', () => { if (pending) return; input.value = 'Continúa desde donde terminó tu última respuesta, sin repetir lo anterior.'; resizeInput(); $('composer').requestSubmit(); });
  input.addEventListener('input', resizeInput);
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); if (!pending) $('composer').requestSubmit(); } });
  $('new-conversation').addEventListener('click', newChat); $('sidebar-toggle').addEventListener('click', openDrawer); $('sidebar-close').addEventListener('click', closeDrawer); $('drawer-backdrop').addEventListener('click', closeDrawer);
  $('history-search').addEventListener('input', renderHistory);
  for (const key of ['history', 'library']) { $(key + '-tab').addEventListener('click', () => switchTab(key)); $(key + '-tab').addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'history' : event.key === 'End' ? 'library' : key === 'history' ? 'library' : 'history'; switchTab(next); $(next + '-tab').focus(); } }); }
  matchMedia('(max-width:720px)').addEventListener('change', event => { if (!event.matches) closeDrawer(); });
  document.addEventListener('keydown', event => {
    if ($('sidebar').dataset.open !== 'true') return;
    if (event.key === 'Escape') { closeDrawer(); event.preventDefault(); }
    if (event.key === 'Tab') { const items = [...$('sidebar').querySelectorAll('button,input,select')].filter(el => el.getClientRects().length && el.tabIndex >= 0 && !el.disabled), first = items[0], last = items.at(-1); if (event.shiftKey && document.activeElement === first) { last.focus(); event.preventDefault(); } else if (!event.shiftKey && document.activeElement === last) { first.focus(); event.preventDefault(); } }
  });
  document.querySelectorAll('[data-prompt]').forEach(el => el.addEventListener('click', () => { input.value = el.dataset.prompt; resizeInput(); input.focus({ preventScroll: true }); }));
  $('personalization').addEventListener('click', () => { closeDrawer(); settings.showModal(); }); $('settings-close').addEventListener('click', () => settings.close()); $('settings-done').addEventListener('click', () => { savePrefs(); settings.close(); });
  for (const id of ['text-size', 'high-contrast', 'reduce-motion', 'response-style', 'mode']) $(id).addEventListener('change', savePrefs);
  $('custom-instructions').addEventListener('change', savePrefs);
  $('settings-reset').addEventListener('click', () => { prefs = {}; applyPrefs(); savePrefs(); });
  $('service-refresh').addEventListener('click', () => { loading = true; updateControls(); refreshStatus(); });
  $('attachment-open').addEventListener('click', () => $('attachment-file').click());
  $('attachment-file').addEventListener('change', async event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return;
    if (file.size > 60000 || !/\.(txt|md|csv|json|log)$/i.test(file.name)) { notify('Adjunta TXT, MD, CSV, JSON o LOG de hasta 60 KB.'); return; }
    try { const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); if (!text.trim() || text.length > 5500 || text.includes('\u0000')) throw new Error(); attachment = { name: file.name.slice(0, 100), text }; renderAttachment(); }
    catch { notify('Usa un archivo de texto UTF-8 de hasta 5500 caracteres.'); }
  });
  $('attachment-remove').addEventListener('click', () => { attachment = null; renderAttachment(); });
  $('export-history').addEventListener('click', () => {
    const raw = JSON.stringify({ app: 'SCALA AI', version: 2, exportedAt: new Date().toISOString(), conversations: chats.map(c => ({ ...c, messages: c.messages.filter(m => m.content) })), library }, null, 2), blob = new Blob([raw], { type: 'application/json' }), url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'SCALA-AI-historial-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('import-history').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return;
    if (file.size > 4000000) { notify('La copia de historial admite hasta 4 MB.'); return; }
    try { const data = JSON.parse(await file.text()), loaded = U.normalizeConversations(Array.isArray(data) ? data : data.conversations); if (!loaded.length) throw new Error('La copia no contiene conversaciones válidas.'); const ids = new Set(chats.map(c => c.id)); for (const chat of loaded) if (!ids.has(chat.id)) { chats.push(chat); ids.add(chat.id); } chats = chats.slice(0, 100); if (Array.isArray(data.library)) { for (const item of data.library) if (item && typeof item.id === 'string' && typeof item.content === 'string' && item.content.length <= 24000 && !library.some(x => x.id === item.id)) library.push({ id: item.id.slice(0, 120), title: typeof item.title === 'string' ? item.title.slice(0, 80) : 'Respuesta', content: item.content }); library = library.slice(0, 50); } save(); renderAll(); notify('Historial importado. Las conversaciones existentes se conservaron.'); }
    catch (error) { notify(error.message || 'No pudimos importar esa copia.'); }
  });
  $('action-close').addEventListener('click', () => $('action-dialog').close());
  $('rename-form').addEventListener('submit', event => { event.preventDefault(); const chat = chats.find(c => c.id === action); if (chat) { chat.title = $('chat-title').value.trim().slice(0, 80) || 'Conversación'; save(); renderHistory(); } $('action-dialog').close(); });
  $('chat-delete').addEventListener('click', () => {
    if ($('chat-delete').textContent !== 'Sí, eliminar') { $('chat-delete').textContent = 'Sí, eliminar'; $('action-feedback').textContent = 'Se eliminará esta conversación del navegador. Tus respuestas guardadas en la biblioteca se conservarán.'; return; }
    if (pending?.chat.id === action) stopPending(); chats = chats.filter(c => c.id !== action); if (activeId === action) activeId = null; save(); renderAll(); $('action-dialog').close();
  });
  $('resource-close').addEventListener('click', () => $('resource-dialog').close()); $('resource-copy').addEventListener('click', () => copyText($('resource-body').textContent));
  for (const dialog of [settings, $('action-dialog'), $('resource-dialog')]) dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
  window.addEventListener('beforeunload', () => { if (pending) { pending.assistant.partial = true; save(); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !pending) refreshStatus(); });
  setInterval(() => { if (!pending && !document.hidden) refreshStatus(); }, 900000);
  window.addEventListener('pageshow', () => { if (!pending) refreshStatus(); });
  let lastWait = -1; setInterval(() => { const wait = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)); if (wait !== lastWait) { lastWait = wait; updateControls(); } }, 1000);
  applyPrefs(); renderAll(); resizeInput(); refreshStatus();
})();
