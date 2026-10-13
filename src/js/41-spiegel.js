/* Spiegel-Modus: schwarzer Vollbild-Überblick für einen Smart Mirror oder einen Bildschirm an der Wand.
 * Schwarz bleibt hinter Spiegelglas unsichtbar, deshalb nur helle Schrift ohne Flächen.
 * Was wo steht, legst du unter Anpassen, Spiegel fest: Bausteine (Uhr, Wetter, Termine …) in sieben Bereichen.
 * Start über den Knopf oben, die Taste S oder die Adresse …/#spiegel. Beenden mit Esc oder S.
 * Hält den Bildschirm wach (Wake Lock, wenn der Browser es kann), kann nachts dimmen und verschiebt den Inhalt
 * alle paar Minuten um ein paar Pixel, damit sich nichts einbrennt. */
const mr = { on: false, fs: false, lock: null, idle: null, shift: -1, last: '' };
function mirrorFromHash() { try { return decodeURIComponent(location.hash.slice(1)).toLowerCase() === 'spiegel'; } catch { return false; } }
async function mirrorLock() {
  if (!mr.on || !('wakeLock' in navigator) || mr.lock) return;
  try { mr.lock = await navigator.wakeLock.request('screen'); mr.lock.addEventListener('release', () => { mr.lock = null; }); } catch { mr.lock = null; }
}
function mirrorOpen(gesture) {
  if (mr.on) return;
  mr.on = true;
  $('#mirror').hidden = false;
  document.documentElement.classList.add('mirror-on');
  if (!mirrorFromHash()) history.replaceState(null, '', location.pathname + location.search + '#spiegel');
  mr.fs = false;
  if (gesture && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().then(() => { mr.fs = true; }).catch(() => {});
  mirrorLock();
  mirrorWake();
  mr.last = '';
  mr.shift = -1;
  mirrorTick(new Date());
}
function mirrorClose() {
  if (!mr.on) return;
  mr.on = false;
  $('#mirror').hidden = true;
  document.documentElement.classList.remove('mirror-on');
  if (mirrorFromHash()) history.replaceState(null, '', location.pathname + location.search);
  if (mr.fs && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  mr.fs = false;
  if (mr.lock) { mr.lock.release().catch(() => {}); mr.lock = null; }
  $('#mirror-btn').focus();
}
/* Maus bewegt: Knopf zum Verlassen zeigen, nach 3 Sekunden wieder weg samt Mauszeiger */
function mirrorWake() {
  $('#mirror').classList.add('awake');
  clearTimeout(mr.idle);
  mr.idle = setTimeout(() => $('#mirror').classList.remove('awake'), 3000);
}
/* Platzhalter für die Vorschau, wenn ein Baustein gerade nichts zu zeigen hat */
const mPh = (k, txt) => `<section class="mb m-ph" data-b="${k}"><b>${esc(MB[k])}</b><span>${esc(txt)}</span></section>`;
/* Die Bausteine. Jeder liefert sein HTML oder nichts, wenn es gerade nichts zu zeigen gibt. */
const MBR = {
  clock(now) {
    const s = state.ui.mirror.secs ? `<span class="sec">${pad(now.getSeconds())}</span>` : '';
    return `<section class="mb m-clock" data-b="clock"><p class="m-time">${pad(now.getHours())}<span class="colon">:</span>${pad(now.getMinutes())}${s}</p><p class="m-date">${WDL[now.getDay()]}, ${now.getDate()}. ${ML[now.getMonth()]}, KW ${isoWeek(now)}</p></section>`;
  },
  notes(now, pv) {
    const list = [...wnMirror(now), ...bdMirror(now).map(t => ({ t, c: '#F0B040' })), ...wsMirror(now)];
    if (!list.length) return pv ? mPh('notes', 'Gerade nichts, hier stehen Warnungen, Geburtstage und Müll') : '';
    return `<ul class="mb m-notes" data-b="notes">${list.map(n => `<li style="--c:${n.c}">${esc(n.t)}</li>`).join('')}</ul>`;
  },
  wx(now, pv) {
    const d = wx.data, c = d && d.current;
    if (!c) return pv ? mPh('wx', 'Kommt, sobald das Wetter geladen ist') : '';
    const w = WMO[c.weather_code] || ['', 'cloud'];
    const hi = d.daily ? Math.round(d.daily.temperature_2m_max[0]) : null, lo = d.daily ? Math.round(d.daily.temperature_2m_min[0]) : null;
    const D = sky.day, sun = D && D.rise && D.set ? `Sonne ${hm(D.rise)} bis ${hm(D.set)}` : '';
    const sub = [hi != null ? `${lo}° bis ${hi}°` : '', mirrorRain(d, now), sun].filter(Boolean).join('. ');
    return `<section class="mb m-wx" data-b="wx"><div class="m-wx-now"><span class="m-wx-ico">${icon(w[1], c.is_day !== 0)}</span><b>${Number.isFinite(c.temperature_2m) ? Math.round(c.temperature_2m) + '°' : ''}</b></div><p>${esc(w[0])}</p><p class="m-dim">${esc(sub)}</p></section>`;
  },
  cm(now, pv) {
    const s = cm.sum;
    if (!s) return pv ? mPh('cm', state.commute.home ? 'Kommt, sobald die Strecke berechnet ist' : 'Trag erst deine Strecke im Pendeln-Widget ein') : '';
    const how = s.closures ? (s.closures === 1 ? 'Sperrung auf der Strecke' : `${s.closures} Sperrungen`) : s.delay >= 1 ? `+${Math.round(s.delay)} Min Stau` : 'freie Fahrt';
    return `<section class="mb m-cm" data-b="cm"><h3>${s.dir === 'home' ? 'Nach Hause' : 'Zur Arbeit'}</h3><p><b>${s.mins} Min</b><span${s.closures || s.delay >= 3 ? ' class="warn"' : ''}>${esc(how)}</span></p></section>`;
  },
  cal(now, pv) {
    const evs = ca.data && caSec().feeds.length ? ca.data.events : null;
    if (!evs) return pv ? mPh('cal', 'Verbinde zuerst deinen Kalender') : '';
    let html = '', n = 0;
    for (let i = 0; i < 2 && n < 7; i++) {
      const day = addDays(sod(now), i);
      const list = caDay(day, evs).filter(e => i > 0 || e.a || e.e > +now);
      if (!list.length) continue;
      html += `<h3>${i ? 'Morgen' : 'Heute'}</h3><ul>`;
      for (const e of list) {
        if (n++ >= 7) break;
        const live = !e.a && e.s <= +now;
        html += `<li style="--c:${caFeedColor(e.f)}"><span class="m-t">${e.a ? 'Ganztags' : live ? 'Jetzt' : hm(new Date(e.s))}</span><span>${esc(e.t)}</span></li>`;
      }
      html += '</ul>';
    }
    return `<section class="mb m-cal" data-b="cal">${html || '<h3>Heute</h3><p class="m-dim">Keine Termine mehr heute und morgen.</p>'}</section>`;
  },
  dep(now, pv) {
    const dep = dpMirror(now);
    if (!dep) return pv ? mPh('dep', 'Wähl zuerst eine Haltestelle im Abfahrten-Widget') : '';
    const go = dep.walk ? dep.rows.find(r => !r.x) : null, left = go ? Math.floor((go.t - dep.walk * 6e4 - +now) / 6e4) : 0;
    return `<section class="mb m-dep" data-b="dep"><h3>${esc(dep.name)}${go ? ` <span>${left < 1 ? 'jetzt los' : `los in ${left} Min`}</span>` : ''}</h3>`
      + (dep.rows.length ? `<ul>${dep.rows.map(r => `<li${r.x ? ' class="x"' : ''}>${dpBadge(r)}<span class="m-to">${esc(r.to)}</span><b>${r.x ? 'fällt aus' : mirrorMin(r.t - +now, r.t)}</b></li>`).join('')}</ul>` : '<p class="m-dim">Gerade keine Abfahrten.</p>') + '</section>';
  },
  cd(now, pv) {
    // Kacheln und Countdowns wie oben im Cockpit, in derselben Reihenfolge
    const u = state.ui, out = [];
    for (const k of normOrder(u.order, u.countdowns)) {
      const el = k.startsWith('cd:') ? $('#cd-' + k.slice(3)) : u.tiles[k] ? $('#t-' + k) : null;
      if (!el) continue;
      const val = el.querySelector('.t-val').textContent.trim();
      if (val) out.push(`<li><span class="m-dim">${esc(el.querySelector('.t-label').textContent)}</span><b>${esc(val)}</b></li>`);
    }
    if (!out.length) return pv ? mPh('cd', 'Schalte unter Kopf ein paar Kacheln ein') : '';
    return `<section class="mb m-cd" data-b="cd"><ul>${out.join('')}</ul></section>`;
  }
};
/* Spiegel in ein Raster zeichnen: Bereiche ohne Inhalt fallen weg, die Mitte hält den Platz frei */
function mirrorRender(root, now, pv) {
  const m = state.ui.mirror, zones = Object.fromEntries(Object.keys(MZ).map(z => [z, []]));
  for (const b of m.blocks) {
    if (!b.on || !MBR[b.k]) continue;
    let h = '';
    try { h = MBR[b.k](now, pv); } catch { h = ''; }
    if (h) zones[b.z].push(h);
  }
  const rows = [];
  if (zones.top.length) rows.push(['top top', 'auto']);
  if (zones.tl.length || zones.tr.length) rows.push(['tl tr', 'auto']);
  rows.push(['mid mid', 'minmax(0,1fr)']);
  if (zones.bl.length || zones.br.length) rows.push(['bl br', 'auto']);
  if (zones.bottom.length) rows.push(['bottom bottom', 'auto']);
  root.style.gridTemplateAreas = rows.map(r => `"${r[0]}"`).join(' ');
  root.style.gridTemplateRows = rows.map(r => r[1]).join(' ');
  root.style.setProperty('--m-k', String(m.size / 100));
  root.innerHTML = Object.entries(zones).filter(([, l]) => l.length).map(([z, l]) => `<div class="mz" data-z="${z}">${l.join('')}</div>`).join('');
  mirrorFit(root);
}
/* Was nicht mehr ganz passt, fliegt raus: zuerst Countdowns, dann späte Abfahrten, späte Termine, dann Hinweise */
function mirrorFit(root) {
  for (let i = 0; i < 40 && root.scrollHeight > root.clientHeight + 1; i++) {
    const cd = root.querySelectorAll('.m-cd li'), dep = root.querySelectorAll('.m-dep li'), cal = root.querySelectorAll('.m-cal li'), nt = root.querySelectorAll('.m-notes li');
    let x = null;
    if (cd.length > 1) x = cd[cd.length - 1];
    else if (dep.length > 2) x = dep[dep.length - 1];
    else if (cal.length > 2) x = cal[cal.length - 1];
    else if (nt.length > 1) x = nt[nt.length - 1];
    if (!x) break;
    const ul = x.parentElement;
    x.remove();
    if (!ul.children.length && ul.previousElementSibling && ul.previousElementSibling.tagName === 'H3') { ul.previousElementSibling.remove(); ul.remove(); }
  }
}
const mirrorPreviewOn = () => dr.open && dr.tab === 'mirror';
function renderMirror() {
  const now = new Date();
  if (mr.on) mirrorRender($('#m-in'), now, false);
  if (mirrorPreviewOn()) { mirrorScale(); mirrorRender($('#mp-in'), now, true); }
}
/* Vorschau: der Spiegel wird in voller Größe (1600 × 900 oder hochkant) gezeichnet und passend verkleinert */
function mirrorScale() {
  const f = $('#mp-frame'), p = f.querySelector('.mp');
  if (!f.offsetWidth || !p.offsetWidth) return;
  p.style.setProperty('--mp-s', String(f.offsetWidth / p.offsetWidth));
}
const mirrorMin = (ms, t) => { const m = Math.floor(ms / 6e4); return m < 1 ? 'jetzt' : m < 60 ? `${m} Min` : hm(new Date(t)); };
/* Regen in den nächsten 2 Stunden in einem Satz */
function mirrorRain(d, now) {
  const m = d.minutely_15;
  if (!m || !m.time) return '';
  const t = now.getTime() / 1000;
  const next = m.time.map((x, i) => [x, m.precipitation[i]]).filter(([x]) => x >= t - 900 && x <= t + 7200);
  if (!next.length) return '';
  if (next[0][1] > 0.05) { const dry = next.find(([, p]) => p <= 0.05); return dry ? `Regen bis etwa ${hm(new Date(dry[0] * 1000))}` : 'Regen hält an'; }
  const wet = next.find(([, p]) => p > 0.05);
  return wet ? `Regen ab etwa ${hm(new Date(wet[0] * 1000))}` : 'Trocken in den nächsten 2 Stunden';
}
/* Liegt die Uhrzeit im Fenster zum Dimmen? Das Fenster darf über Mitternacht gehen. */
function mirrorDimNow(now) {
  const d = state.ui.mirror.dim;
  if (!d.on || d.from === d.to) return false;
  const t = hm(now);
  return d.from < d.to ? t >= d.from && t < d.to : t >= d.from || t < d.to;
}
function mirrorTick(now) {
  if (!mr.on && !mirrorPreviewOn()) return;
  const k = `${hm(now)}|${ymd(now)}`;
  if (k !== mr.last) { mr.last = k; renderMirror(); }
  if (state.ui.mirror.secs) for (const s of document.querySelectorAll('.m-time .sec')) s.textContent = pad(now.getSeconds());
  if (!mr.on) return;
  const m = state.ui.mirror, inner = $('#m-in');
  inner.style.opacity = mirrorDimNow(now) ? String(m.dim.lvl / 100) : '';
  const s = Math.floor(now.getTime() / 3e5);
  if (s !== mr.shift) {
    mr.shift = s;
    const a = (s * 2.39996) % (2 * Math.PI);
    inner.style.transform = reduceMotion || !m.shift ? '' : `translate(${(Math.cos(a) * 6).toFixed(1)}px,${(Math.sin(a) * 6).toFixed(1)}px)`;
  }
}
$('#mirror-btn').addEventListener('click', () => mirrorOpen(true));
$('#m-exit').addEventListener('click', mirrorClose);
$('#mirror').addEventListener('mousemove', mirrorWake);
$('#mirror').addEventListener('touchstart', mirrorWake, { passive: true });
document.addEventListener('keydown', e => {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  if (mr.on && (e.key === 'Escape' || e.key === 's' || e.key === 'S')) { e.preventDefault(); mirrorClose(); return; }
  if (mr.on || (e.key !== 's' && e.key !== 'S')) return;
  if (dr.open || edit.on || document.querySelector('dialog[open]')) return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  e.preventDefault();
  mirrorOpen(true);
});
// Wer den Vollbild-Modus mit Esc beendet, will raus aus dem Spiegel
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && mr.on && mr.fs) mirrorClose(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') mirrorLock(); });
addEventListener('hashchange', () => { if (mirrorFromHash()) mirrorOpen(false); else if (mr.on) mirrorClose(); });
if (typeof ResizeObserver === 'function') new ResizeObserver(mirrorScale).observe($('#mp-frame'));
