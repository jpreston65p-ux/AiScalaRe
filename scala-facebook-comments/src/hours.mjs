const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const abbreviations = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const minute = text => Number(text.slice(0, 2)) * 60 + Number(text.slice(3));
export function validateHours(value) {
  if (value == null || typeof value === 'string' && /\[[^\]]+\]/.test(value)) return null;
  if (!value || typeof value !== 'object' || !Array.isArray(value.days) || !value.days.length || value.days.length > 7 || value.days.some(d => !Number.isInteger(d) || d < 0 || d > 6) || typeof value.timeZone !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.end) || value.start === value.end) throw new Error('invalid_hours');
  try { new Intl.DateTimeFormat('es', { timeZone: value.timeZone }).format(0); } catch { throw new Error('invalid_hours'); }
  return { days: [...new Set(value.days)].sort((a, b) => a - b), start: value.start, end: value.end, timeZone: value.timeZone };
}
export function hoursStatus(hours, now) {
  if (!hours) return null;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: hours.timeZone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));
  const get = type => parts.find(p => p.type === type)?.value;
  const today = abbreviations.indexOf(get('weekday')), current = Number(get('hour')) * 60 + Number(get('minute'));
  const start = minute(hours.start), end = minute(hours.end);
  const open = start < end ? hours.days.includes(today) && current >= start && current < end
    : hours.days.includes(today) && current >= start || hours.days.includes((today + 6) % 7) && current < end;
  return { open, text: `${hours.days.map(d => days[d]).join(', ')}, de ${hours.start} a ${hours.end} (${hours.timeZone})`, key: `${get('year')}-${get('month')}-${get('day')}:${hours.timeZone}:${hours.days.join(',')}:${hours.start}:${hours.end}` };
}
