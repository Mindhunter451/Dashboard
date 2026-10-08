/* Kleine Helfer für Datum, Text und DOM */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const DAY = 864e5;
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const validYmd = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const validHm = s => /^\d{2}:\d{2}$/.test(s || '');
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sod = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const at = (d, t) => { const [h, m] = t.split(':').map(Number); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m); };
const dayDiff = (a, b) => Math.round((sod(b) - sod(a)) / DAY);
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WDL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MS = ['Jan', 'Feb', 'März', 'Apr', 'Mai', 'Juni', 'Juli', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const ML = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp01 = x => Math.max(0, Math.min(1, x));
const dm = d => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
const dmy = d => `${dm(d)}${String(d.getFullYear()).slice(2)}`;
const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const pctTxt = p => (p * 100).toFixed(1).replace('.', ',') + ' %';
const numDe = (x, dec = 0) => (Math.round(x * 10 ** dec) / 10 ** dec).toFixed(dec).replace('.', ',');
const daysTxt = n => n === 0.5 ? 'halber Tag' : `${numDe(n, n % 1 ? 1 : 0)} ${n === 1 ? 'Tag' : 'Tage'}`;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function dur(ms, dat) {
  ms = Math.max(0, ms);
  const min = Math.floor(ms / 6e4);
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  if (d >= 2) return `${d} ${dat ? 'Tagen' : 'Tage'}`;
  if (d === 1) return h ? `1 Tag ${h} Std` : '1 Tag';
  if (h) return m ? `${h} Std ${m} Min` : `${h} Std`;
  if (m) return `${m} Min`;
  return 'unter 1 Min';
}
const hrsMin = ms => { const min = Math.max(0, Math.floor(ms / 6e4)); const h = Math.floor(min / 60), m = min % 60; return h ? (m ? `${h} Std ${m} Min` : `${h} Std`) : `${m} Min`; };
const inDays = n => n === 0 ? 'Heute' : n === 1 ? 'Morgen' : `in ${n} Tagen`;

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const wd = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - wd);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / DAY + 1) / 7);
}

const PENCIL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>';
const TRASH = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13"/></svg>';
const LEFT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
const RIGHT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

async function getJson(url, ms = 9000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}

const slug = s => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
