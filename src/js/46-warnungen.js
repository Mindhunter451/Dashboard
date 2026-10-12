/* Amtliche Wetterwarnungen des Deutschen Wetterdienstes für den Ort des Wetter-Widgets.
 * Die Daten kommen über Bright Sky (frei, ohne Key), das die Warnungen vom Open-Data-Server des DWD als JSON anbietet.
 * Gilt nur für Orte in Deutschland. Geladen wird zusammen mit dem Wetter, höchstens alle 5 Minuten.
 * Alte Warnungen werden bewusst nicht aufgehoben: lieber keine Warnung als eine veraltete. */
const WN_API = 'https://api.brightsky.dev/alerts';
const WN_LV = { minor: 1, moderate: 2, severe: 3, extreme: 4 };
const WN_NAME = ['', 'Wetterwarnung', 'Markantes Wetter', 'Unwetter', 'Extremes Unwetter'];
const WN_COLOR = ['', '#F2C12E', '#F08A1C', '#D7263D', '#8E2DA8'];
const wn = { list: [], at: 0, key: '', busy: false, err: false, de: true };
/* Der DWD schreibt Ereignisse in Großbuchstaben („SCHWERES GEWITTER mit ORKANBÖEN“). Daraus wird normale Schreibung. */
const WN_SMALL = new Set(['MIT', 'UND', 'VOR', 'VON', 'IM', 'IN', 'AM', 'BIS', 'ODER', 'AUF']);
function wnEvent(s) {
  const w = String(s || '').trim().split(/\s+/).filter(Boolean);
  return w.map((x, i) => {
    const up = x.toUpperCase(), low = x.toLowerCase();
    if (WN_SMALL.has(up)) return low;
    if (/^UV\b|^UV-/.test(up)) return 'UV' + x.slice(2).toLowerCase().replace(/-(\p{L})/u, (_, c) => '-' + c.toUpperCase());
    const prev = (w[i - 1] || '').toUpperCase(), next = w[i + 1];
    // Eigenschaftswörter mitten im Namen bleiben klein: „extrem ergiebiger Dauerregen“, „mit heftigem Starkregen“
    if (i > 0 && next && !WN_SMALL.has(next.toUpperCase()) && ['EXTREM', 'MIT', 'UND'].includes(prev)) return low;
    return (low.charAt(0).toUpperCase() + low.slice(1)).replace(/-(\p{L})/u, (_, c) => '-' + c.toUpperCase());
  }).join(' ');
}
function wnParse(list) {
  const out = [], seen = new Set();
  for (const a of Array.isArray(list) ? list : []) {
    if (!a || typeof a !== 'object' || a.status === 'test' || a.response_type === 'allclear') continue;
    const on = Date.parse(a.onset || a.effective), ex = a.expires ? Date.parse(a.expires) : NaN;
    if (!Number.isFinite(on)) continue;
    const ev = wnEvent(a.event_de || String(a.headline_de || '').replace(/^amtliche\s+\S+\s+vor\s+/i, '')).slice(0, 80) || 'Wetterwarnung';
    const k = `${ev}|${on}|${ex}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      id: String(a.id || a.alert_id || k).slice(0, 80), lv: WN_LV[a.severity] || 1, ev, on, ex: Number.isFinite(ex) ? ex : null,
      desc: String(a.description_de || '').replace(/\s+/g, ' ').trim().slice(0, 1200),
      ins: String(a.instruction_de || '').replace(/\s+/g, ' ').trim().slice(0, 800)
    });
  }
  return out.sort((x, y) => y.lv - x.lv || x.on - y.on);
}
async function wnLoad(loc, force) {
  if (!loc || !Number.isFinite(+loc.lat) || !Number.isFinite(+loc.lon)) return;
  const key = `${(+loc.lat).toFixed(3)},${(+loc.lon).toFixed(3)}`;
  if (wn.busy || (!force && key === wn.key && Date.now() - wn.at < 5 * 6e4)) return;
  wn.busy = true;
  try {
    const j = await getJson(`${WN_API}?lat=${(+loc.lat).toFixed(4)}&lon=${(+loc.lon).toFixed(4)}`, 12000);
    if (!j || !Array.isArray(j.alerts)) throw new Error('format');
    wn.list = wnParse(j.alerts);
    // Ohne Warnzelle liegt der Ort nicht in Deutschland, dann gibt es hier keine DWD-Warnungen
    wn.de = !!j.location;
    wn.key = key;
    wn.at = Date.now();
    wn.err = false;
  } catch {
    wn.err = true;
    if (key !== wn.key) { wn.list = []; wn.key = ''; }
  }
  wn.busy = false;
  renderWarnAll();
}
/* Warnungen, die noch gelten und spätestens in „ahead“ Millisekunden beginnen */
const wnActive = (now, ahead = 0) => wn.list.filter(w => (w.ex == null || w.ex > +now) && w.on <= +now + ahead);
function wnWhen(w, now) {
  const day = (t, rel) => { const d = dayDiff(rel, new Date(t)); return d === 0 ? '' : d === 1 ? 'morgen ' : `${WD[new Date(t).getDay()]} `; };
  if (w.on <= +now) return w.ex ? `bis ${day(w.ex, now)}${hm(new Date(w.ex))} Uhr` : 'gilt jetzt';
  const end = w.ex ? ` bis ${day(w.ex, new Date(w.on))}${hm(new Date(w.ex))}` : '';
  return `ab ${day(w.on, now)}${hm(new Date(w.on))}${end} Uhr`;
}
function renderWarn() {
  const box = $('#wx-warn'), now = new Date(), list = wnActive(now, 2 * DAY).slice(0, 3);
  const open = new Set([...box.querySelectorAll('details[open]')].map(d => d.dataset.id));
  const html = list.map(w => `<details class="wn" data-id="${esc(w.id)}" data-lv="${w.lv}" style="--wc:${WN_COLOR[w.lv]}"${open.has(w.id) ? ' open' : ''}>`
    + `<summary><span class="wn-lv">${esc(WN_NAME[w.lv])}</span><b>${esc(w.ev)}</b><span class="wn-t">${esc(wnWhen(w, now))}</span></summary>`
    + `${w.desc ? `<p>${esc(w.desc)}</p>` : ''}${w.ins ? `<p class="wn-ins">${esc(w.ins)}</p>` : ''}</details>`).join('');
  if (box.dataset.h !== html) { box.dataset.h = html; box.innerHTML = html; }
  box.hidden = !list.length;
}
function renderWarnAll() {
  renderWarn();
  if (wx.data) $('#wx-src').textContent = wxSrcText();
  peekAll();
  nowDirty();
  renderMirror();
}
/* Einmal pro Minute: Zeiten neu schreiben, abgelaufene Warnungen fallen raus */
function wnTick(now) {
  if (now.getSeconds() !== 30 || !wn.list.length) return;
  renderWarn();
  peekAll();
}
/* Für den Spiegel: Warnungen, die jetzt gelten oder in den nächsten 12 Stunden beginnen */
const wnMirror = now => wnActive(now, 12 * 36e5).slice(0, 2).map(w => ({ t: `${WN_NAME[w.lv]}: ${w.ev}, ${wnWhen(w, now)}`, c: WN_COLOR[w.lv] }));
