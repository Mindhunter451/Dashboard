/* Spiegel-Modus: schwarzer Vollbild-Überblick für einen Smart Mirror oder einen Bildschirm an der Wand.
 * Schwarz bleibt hinter Spiegelglas unsichtbar, deshalb nur helle Schrift ohne Flächen.
 * Start über den Knopf oben, die Taste S oder die Adresse …/#spiegel. Beenden mit Esc oder S.
 * Hält den Bildschirm wach (Wake Lock, wenn der Browser es kann) und verschiebt den Inhalt alle paar Minuten
 * um ein paar Pixel, damit sich nichts einbrennt. */
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
  if (!vs.cur || !vs.cur.key.startsWith(ymd(new Date()))) vsLoad();
  renderMirror();
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
function renderMirror() {
  if (!mr.on) return;
  const now = new Date();
  $('#m-time').innerHTML = `${pad(now.getHours())}<span class="colon">:</span>${pad(now.getMinutes())}`;
  $('#m-date').textContent = `${WDL[now.getDay()]}, ${now.getDate()}. ${ML[now.getMonth()]}, KW ${isoWeek(now)}`;
  // Wetter
  const d = wx.data, c = d && d.current;
  $('#m-wx').hidden = !c;
  if (c) {
    const w = WMO[c.weather_code] || ['', 'cloud'];
    $('#m-wx-ico').innerHTML = icon(w[1], c.is_day !== 0);
    $('#m-wx-temp').textContent = Number.isFinite(c.temperature_2m) ? `${Math.round(c.temperature_2m)}°` : '';
    $('#m-wx-desc').textContent = w[0];
    const hi = d.daily ? Math.round(d.daily.temperature_2m_max[0]) : null, lo = d.daily ? Math.round(d.daily.temperature_2m_min[0]) : null;
    const D = sky.day, sun = D && D.rise && D.set ? `Sonne ${hm(D.rise)} bis ${hm(D.set)}` : '';
    $('#m-wx-sub').textContent = [hi != null ? `${lo}° bis ${hi}°` : '', mirrorRain(d, now), sun].filter(Boolean).join('. ');
  }
  // Termine heute und morgen
  const box = $('#m-cal');
  const evs = ca.data && caSec().feeds.length ? ca.data.events : null;
  box.hidden = !evs;
  if (evs) {
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
    box.innerHTML = html || '<h3>Heute</h3><p class="m-dim">Keine Termine mehr heute und morgen.</p>';
  }
  // Hinweise unter dem Datum: Geburtstage und Müllabfuhr von heute und morgen
  const notes = [...bdMirror(now).map(t => ({ t, c: '#F0B040' })), ...wsMirror(now)];
  $('#m-notes').innerHTML = notes.map(n => `<li style="--c:${n.c}">${esc(n.t)}</li>`).join('');
  // Abfahrten der ersten Haltestelle
  const dep = dpMirror(now), dbox = $('#m-dep');
  dbox.hidden = !dep;
  if (dep) {
    const go = dep.walk ? dep.rows.find(r => !r.x) : null, left = go ? Math.floor((go.t - dep.walk * 6e4 - +now) / 6e4) : 0;
    dbox.innerHTML = `<h3>${esc(dep.name)}${go ? ` <span>${left < 1 ? 'jetzt los' : `los in ${left} Min`}</span>` : ''}</h3>`
      + (dep.rows.length ? `<ul>${dep.rows.map(r => `<li${r.x ? ' class="x"' : ''}>${dpBadge(r)}<span class="m-to">${esc(r.to)}</span><b>${r.x ? 'fällt aus' : mirrorMin(r.t - +now, r.t)}</b></li>`).join('')}</ul>` : '<p class="m-dim">Gerade keine Abfahrten.</p>');
  }
  // Countdowns aus den Kacheln
  const cd = [];
  for (const id of ['t-fa', 't-we', 't-ur']) {
    const t = $('#' + id);
    if (!t || !state.ui.tiles[id.slice(2)]) continue;
    cd.push(`<li><span class="m-dim">${esc(t.querySelector('.t-label').textContent)}</span><b>${esc(t.querySelector('.t-val').textContent)}</b></li>`);
  }
  for (const c2 of state.ui.countdowns.slice(0, 2)) {
    const t = $('#cd-' + c2.id);
    if (t) cd.push(`<li><span class="m-dim">${esc(c2.name)}</span><b>${esc(t.querySelector('.t-val').textContent)}</b></li>`);
  }
  $('#m-cd').innerHTML = cd.length ? `<ul>${cd.join('')}</ul>` : '';
  // Vers
  const v = vs.cur && vs.cur.key && vs.cur.key.startsWith(ymd(now)) ? vs.cur : null;
  $('#m-verse').hidden = !v;
  if (v) { $('#m-verse-text').textContent = v.text; $('#m-verse-ref').textContent = v.ref; }
  mirrorFit();
}
/* Rechte Spalte: Was nicht mehr ganz passt, fliegt raus, zuerst Countdowns, dann späte Abfahrten (mindestens 2 bleiben) */
function mirrorFit() {
  const side = $('.m-side');
  for (let i = 0; i < 12 && side.scrollHeight > side.clientHeight + 1; i++) {
    const cd = $$('#m-cd li'), dep = $$('#m-dep li');
    if (cd.length) cd[cd.length - 1].remove();
    else if (dep.length > 2) dep[dep.length - 1].remove();
    else break;
  }
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
function mirrorTick(now) {
  if (!mr.on) return;
  const k = `${hm(now)}|${ymd(now)}`;
  if (k !== mr.last) { mr.last = k; renderMirror(); }
  const s = Math.floor(now.getTime() / 3e5);
  if (s !== mr.shift) {
    mr.shift = s;
    const a = (s * 2.39996) % (2 * Math.PI);
    $('#m-in').style.transform = reduceMotion ? '' : `translate(${(Math.cos(a) * 6).toFixed(1)}px,${(Math.sin(a) * 6).toFixed(1)}px)`;
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
