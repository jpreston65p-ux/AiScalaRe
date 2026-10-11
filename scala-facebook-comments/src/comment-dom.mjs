// Functions shared by the browser adapter and DOM fixture tests. The selectors
// were observed on an owned reel and a regular post, not guessed from classes.
export function readCommentDom(element, selectors) {
  const own = selector => Array.from(element.querySelectorAll(selector))
    .filter(node => node.closest('[role="article"]') === element);
  const unique = selector => {
    const nodes = own(selector);
    if (nodes.length !== 1) throw new Error('selectors_not_calibrated');
    return nodes[0];
  };
  const label = element.getAttribute('aria-label') || '';
  const isReply = label.startsWith('Respuesta de ');
  if (!isReply && !label.startsWith('Comentario de ')) throw new Error('comment_identity_unknown');
  const time = unique(selectors.commentTime);
  const author = unique(selectors.commentAuthor);
  const bodies=own(selectors.commentText);
  if (bodies.length>1) throw new Error('selectors_not_calibrated');
  const body=bodies[0];
  const read = node => {
    if (node.nodeType === 3) return node.nodeValue || '';
    if (node.nodeType !== 1 || node.getAttribute('aria-hidden') === 'true') return '';
    if (node.tagName === 'IMG') return node.getAttribute('alt') || node.getAttribute('aria-label') || '';
    if (node.tagName === 'BR') return '\n';
    const result = Array.from(node.childNodes).map(read).join('');
    return /^(DIV|P)$/.test(node.tagName) ? result + '\n' : result;
  };
  return { href: time.getAttribute('href'), time: time.getAttribute('aria-label'),
    authorHref: author.getAttribute('href'), authorName: author.textContent.trim(),
    text: body ? read(body).trim() : '', isReply };
}

export function readPostCaption(element) {
  let stopped=false;
  const read=node=>{
    if(stopped)return '';
    if(node.nodeType===3)return node.nodeValue || '';
    if(node.nodeType!==1)return '';
    if(node.getAttribute('role')==='article' && /^(Comentario|Respuesta) de /.test(node.getAttribute('aria-label') || '')){stopped=true;return '';}
    if(node.getAttribute('role')==='textbox' || node.getAttribute('aria-hidden')==='true')return '';
    if(node.tagName==='IMG')return node.getAttribute('alt') || '';
    return Array.from(node.childNodes).map(read).join(' ');
  };
  return read(element).trim();
}

export function commentThreadDepth(element, selectors) {
  let container=element;
  for (let depth=1;depth<=8;depth++) {
    container=container.parentElement;
    if (!container || container.querySelectorAll(selectors.commentRows).length !== 1) return null;
    const toggle=Array.from(container.querySelectorAll('[role="button"]')).some(node=>/^(Ver|Mostrar).*respuest/.test(node.textContent));
    if (toggle || container.querySelector('[role="textbox"][aria-label^="Responde a "]') || container.querySelector(selectors.replyRows)) return depth;
  }
  return null;
}

export function parseSpanishFacebookTime(value, timeZone, now = Date.now()) {
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const text = typeof value === 'string' ? value.toLowerCase().replace(/[\u00a0\u202f]/g, ' ').trim() : '';
  const match = /^(?:lunes|martes|miércoles|jueves|viernes|sábado|domingo), (\d{1,2}) de ([a-z]+) de (\d{4}) a las (\d{1,2}):(\d{2}) ?(am|pm)$/.exec(text);
  if (!match) throw new Error('unreliable_timestamp');
  const [, d, month, y, h, m, meridiem] = match;
  const year = Number(y), monthIndex = months.indexOf(month), day = Number(d), hour12 = Number(h), minute = Number(m);
  if (monthIndex < 0 || year < 2020 || day < 1 || day > 31 || hour12 < 1 || hour12 > 12 || minute > 59) throw new Error('unreliable_timestamp');
  const hour = hour12 % 12 + (meridiem === 'pm' ? 12 : 0);
  let formatter;
  try { formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' }); }
  catch { throw new Error('unreliable_timestamp'); }
  const parts = epoch => Object.fromEntries(formatter.formatToParts(epoch).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
  const civil = Date.UTC(year, monthIndex, day, hour, minute);
  const offsetAt = epoch => { const p = parts(epoch); return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second) - Math.floor(epoch/1000)*1000; };
  // Trying both offsets also detects ambiguous civil times at a DST change.
  const candidates = [...new Set([-86400000,0,86400000].map(delta => civil - offsetAt(civil + delta)))].filter(epoch => {
    const p = parts(epoch);
    return p.year === year && p.month === monthIndex+1 && p.day === day && p.hour === hour && p.minute === minute;
  });
  if (candidates.length !== 1 || candidates[0] > now + 60000) throw new Error('unreliable_timestamp');
  return candidates[0];
}
