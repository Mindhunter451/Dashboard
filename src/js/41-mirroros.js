/* MirrorOS: der Spiegel als schlichte Fassung einer Cockpit-Seite. Dieselben Widgets in derselben Reihenfolge und Breite,
 * nur ohne Karten, Rahmen und Knöpfe. Oben wie im Cockpit Uhr und Datum, darunter die Kacheln der Seite.
 * Was nicht mehr auf den Bildschirm passt, wird erst gekürzt und fällt dann von hinten weg.
 * Pomodoro, Schnellzugriff und Rennanalyse lässt der Spiegel aus, die leben vom Antippen.
 * Der alte Aufbau mit frei verteilten Bausteinen (41-spiegel.js) bleibt unter Anpassen, MirrorOS, wählbar. */
const MOS_SKIP = new Set(['links', 'pomodoro', 'f1an']);
const mosPage = () => state.pages.find(p => p.id === state.ui.mirror.page) || state.pages[0];
/* Kopf wie im Cockpit: die Texte kommen aus dem echten Kopf, damit beides immer dasselbe sagt */
function mosHead(now) {
  const txt = sel => { const el = $(sel); return el && !el.hidden ? el.textContent.replace(/\s+/g, ' ').trim() : ''; };
  const secs = state.ui.mirror.secs ? `<span class="sec">${pad(now.getSeconds())}</span>` : '';
  const kw = txt('#h-kw'), date = txt('#h-date');
  const lines = ['#h-wx', '#h-sun', '#h-next'].map(txt).filter(Boolean);
  return `<header class="mos-head"><div class="mos-clock"><p class="mos-greet">${esc(txt('#h-greet'))}</p><p class="m-time">${pad(now.getHours())}<span class="colon">:</span>${pad(now.getMinutes())}${secs}</p></div>`
    + `<div class="mos-side"><p class="mos-day">${esc(txt('#h-day') || WDL[now.getDay()])}</p><p class="mos-date">${esc(date || `${now.getDate()}. ${ML[now.getMonth()]}`)}${kw ? ` <span class="m-dim">KW ${esc(kw)}</span>` : ''}</p>`
    + lines.map(l => `<p class="m-dim">${esc(l)}</p>`).join('') + '</div></header>';
}
/* Kacheln wie oben im Cockpit, in derselben Reihenfolge */
function mosTiles() {
  const u = state.ui, out = [];
  for (const k of normOrder(u.order, u.countdowns)) {
    const el = k.startsWith('cd:') ? $('#cd-' + k.slice(3)) : u.tiles[k] ? $('#t-' + k) : null;
    if (!el || el.hidden) continue;
    const q = s => { const x = el.querySelector(s); return x ? x.textContent.replace(/\s+/g, ' ').trim() : ''; };
    const val = q('.t-val');
    if (val) out.push(`<li><span class="m-dim">${esc(q('.t-label'))}</span><b>${esc(val)}</b>${q('.t-sub') ? `<small>${esc(q('.t-sub'))}</small>` : ''}</li>`);
  }
  return out.length ? `<ul class="mos-tiles">${out.join('')}</ul>` : '';
}
/* Pendeln: Fahrzeit, Ankunft, was bremst, Umleitung und das Streckenband */
function mosCm(now, pv) {
  const s = cm.sum;
  if (!s) return pv ? `<p class="m-dim">${state.commute.home ? 'Kommt, sobald die Strecke berechnet ist' : 'Trag erst deine Strecke im Pendeln-Widget ein'}</p>` : '';
  // Nach Hause vor Feierabend: ab Feierabend gerechnet, sonst ab jetzt
  const wb = workBar(), end = s.dir === 'home' && wb && !freeReason(wb, now) && now < at(now, wb.end) ? at(now, wb.end) : null;
  const t0 = end || now;
  const bad = s.closures || s.delay >= 3;
  const how = s.closures ? (s.closures === 1 ? 'Sperrung auf der Strecke' : `${s.closures} Sperrungen`) : s.delay >= 1 ? `+${Math.round(s.delay)} Min Stau` : 'Freie Fahrt';
  const band = cm.res && cm.res.orte ? cbBand(cm.res, cm.bandItems || [], t0) : null;
  const dev = s.dev ? `<p class="m-cm-dev">${esc(cbDevShort(s.dev))}</p>` : '';
  return `<div class="m-cmx"><p class="m-cm-big"><b>${s.mins} Min</b><span>${end ? `ab ${esc(wb.end)}, ` : ''}an ${hm(new Date(+t0 + (s.sec || s.mins * 60) * 1000))}</span></p>`
    // Mit Umleitung ersetzt sie das „Freie Fahrt“, Stau oder Sperrung bleiben stehen
    + (bad || !dev ? `<p class="m-cm-how${bad ? ' warn' : ''}">${esc(how)}</p>` : '') + `${dev}${cbHtml(band)}</div>`;
}
/* Öffis: wann du los musst, die Fahrten der Verbindung mit Abfahrt und was danach kommt */
function mosPt(now, pv) {
  ptNeed(now);
  const S = ptSummary(now);
  if (!S) return pv ? `<p class="m-dim">${state.commute.home ? 'Kommt, sobald die Verbindungen geladen sind' : 'Trag erst deine Strecke im Pendeln-Widget ein'}</p>` : '';
  const f = S.it, t = +now, [v, lv] = ptVerdict(f), go = ptLeave(f, t);
  const legs = ptTr(f.legs).map(l => {
    const m = ptLate(l.f);
    return `<li${l.x ? ' class="x"' : ''}>${dpBadge(l)}<span class="m-to">${esc(l.f.n)}</span><b>${l.x ? 'fällt aus' : `${ptHm(l.f.t)}${m >= 1 ? `<small class="m-late">+${m}</small>` : ''}`}</b></li>`;
  }).join('');
  return `<div class="m-cmx"><p class="m-cm-big"><b>${esc(go[0].toUpperCase() + go.slice(1))}</b><span>an ${ptHm(f.e)}</span></p>`
    + (lv === 'bad' || lv === 'warn' ? `<p class="m-cm-how warn">${esc(v)}</p>` : '')
    + `<ul class="m-dep-l m-pt-l">${legs}</ul>`
    + (S.next ? `<p class="m-dim m-pt-next">Danach los um ${ptHm(S.next.s)}, an ${ptHm(S.next.e)}</p>` : '') + '</div>';
}
function mosDep(w, now, pv) {
  const dep = dpMirrorOf(w, now);
  if (!dep) return { html: pv ? '<p class="m-dim">Kommt, sobald die Abfahrten geladen sind</p>' : '' };
  const go = dep.walk ? dep.rows.find(r => !r.x) : null, left = go ? Math.floor((go.t - dep.walk * 6e4 - +now) / 6e4) : 0;
  const html = dep.rows.length ? `<ul class="m-dep-l">${dep.rows.map(r => `<li${r.x ? ' class="x"' : ''}>${dpBadge(r)}<span class="m-to">${esc(r.to)}</span><b>${r.x ? 'fällt aus' : mirrorMin(r.t - +now, r.t)}</b></li>`).join('')}</ul>` : '<p class="m-dim">Gerade keine Abfahrten.</p>';
  return { html, extra: go ? (left < 1 ? 'jetzt los' : `los in ${left} Min`) : '' };
}
function mosBday(now) {
  const today = sod(now), list = bdUpcoming(now).slice(0, 3);
  if (!list.length) return '';
  return `<ul class="m-lines">${list.map(x => {
    const n = dayDiff(today, x.d), when = n === 0 ? 'heute' : n === 1 ? 'morgen' : n < 7 ? WDL[x.d.getDay()] : `${WD[x.d.getDay()]} ${dm(x.d)}`;
    return mRow({ ico: 'bday', t: `${x.name}${x.age != null ? ` wird ${x.age}` : ''}`, when, lv: n <= 1 ? 'now' : '' });
  }).join('')}</ul>`;
}
function mosWaste(now) {
  const today = sod(now), list = wsUpcoming(state.waste.bins, now).slice(0, 3);
  if (!list.length) return '';
  return `<ul class="m-lines">${list.map(x => mRow({ ico: 'waste', t: x.b.name, when: wsDay(x.next, today), wc: x.b.color, lv: dayDiff(today, x.next) <= 1 ? 'now' : '' })).join('')}</ul>`;
}
/* Ein Widget als Block: Titel wie auf der Karte, darunter das Wichtigste */
function mosBlock(id, it, now, pv, cx) {
  const w = state.widgets[id];
  if (!w || MOS_SKIP.has(w.type)) return '';
  let title = widgetTitle(id), extra = '', inner = '';
  try {
    switch (w.type) {
      case 'now': inner = cx.nw.length ? `<ul class="m-now">${cx.nw.map(x => mRow({ ico: x.ico, t: x.t, s: mTxt(x.s), when: x.w && x.w !== 'live' ? x.w : '', lv: x.lv, wc: x.wc })).join('')}</ul>` : pv ? '<p class="m-dim">Gerade drängt nichts.</p>' : ''; break;
      case 'weather': inner = MBR.wx(now, pv); break;
      case 'commute': inner = ptMode() ? mosPt(now, pv) : mosCm(now, pv); if (cm.sum || ptMode()) title = cm.dir === 'home' ? 'Nach Hause' : 'Zur Arbeit'; break;
      case 'cal': inner = MBR.cal(now, pv); break;
      case 'dep': { const d = mosDep(w, now, pv); inner = d.html; extra = d.extra; if (!w.title && w.cfg.stop) title = w.cfg.stop.name; break; }
      case 'bday': inner = mosBday(now); break;
      case 'waste': inner = mosWaste(now); break;
      default: { const r = mLine(id, now); inner = r ? `<ul class="m-lines">${mRow(r)}</ul>` : ''; }
    }
  } catch { inner = ''; }
  if (!inner) return '';
  return `<section class="mw" data-type="${w.type}" data-span="${it.s}"><h3 class="mw-h">${(w.type === 'commute' && ptMode() ? TICON.dep : TICON[w.type]) || ''}<span>${esc(title)}</span>${extra ? `<b>${esc(extra)}</b>` : ''}</h3>${inner}</section>`;
}
function mosRender(root, now, pv) {
  const m = state.ui.mirror, page = mosPage();
  root.classList.add('mos');
  root.style.gridTemplateAreas = '';
  root.style.gridTemplateRows = '';
  root.style.setProperty('--m-k', String(m.size / 100));
  const items = page.items.filter(it => state.widgets[it.w]), types = new Set(items.map(it => state.widgets[it.w].type));
  const on = { cal: types.has('cal'), dep: types.has('dep'), cm: types.has('commute'), wx: types.has('weather') };
  // Erst was anderen etwas abnimmt: Morgen-Vorschau, dann Jetzt wichtig. Was ein eigener Block zeigt, kommt dort nicht doppelt.
  const cx = { cover: new Set(), lines: items.filter(it => MLR[state.widgets[it.w].type]).map(it => ({ w: it.w, m: 'fix' })), nw: [], eve: null, on };
  try { cx.eve = mirrorEve(now, cx, pv); } catch { cx.eve = null; }
  if (types.has('now')) { try { cx.nw = mirrorNow(now, cx, on, pv); } catch { cx.nw = []; } }
  const blocks = items.map(it => mosBlock(it.w, it, now, pv, cx)).filter(Boolean);
  if (cx.eve) blocks.unshift(`<section class="mw mw-eve" data-span="2">${MBR.eve(now, pv, cx)}</section>`);
  const empty = !blocks.length ? `<p class="mos-empty m-dim">${pv ? `Auf der Seite „${esc(page.name)}“ liegt nichts, was der Spiegel zeigen kann.` : ''}</p>` : '';
  root.innerHTML = mosHead(now) + (page.tiles ? mosTiles() : '') + `<div class="mos-grid">${blocks.join('')}${empty}</div>`;
  mosLayout(root);
}
/* Wie im Cockpit: Spalten nach Breite, jeder Block in die kürzeste Spalte. Passt es nicht, wird gekürzt:
 * erst Listen in den Blöcken, die unten überstehen, dann der letzte davon ganz. */
/* mini: das Streckenband als Fließtext statt untereinander, braucht ein Drittel der Höhe */
const MOS_FIT = [['.m-cal li', 3], ['.m-now .ml', 3], ['.m-dep-l:not(.m-pt-l) li', 3], ['.m-eve .ml', 3], ['.m-wx-hrs', 0], ['.m-pt-next', 0], ['mini'], ['.m-cal li', 2], ['.m-now .ml', 2], ['.m-dep-l:not(.m-pt-l) li', 2], ['.m-lines .ml', 1], ['.m-eve .ml', 2], ['.cm-band', 0], ['.m-cm-dev', 0], ['.m-cal li', 1], ['.m-now .ml', 1], ['.m-dep-l:not(.m-pt-l) li', 1], ['.m-pt-l li', 2]];
function mosLayout(root) {
  const grid = root.querySelector('.mos-grid');
  if (!grid) return;
  // Mindestbreite einer Spalte: 15 Zeichenhöhen, wächst also mit „Größe“
  const cs = getComputedStyle(grid), gap = parseFloat(cs.columnGap) || 32, rgap = parseFloat(cs.rowGap) || gap, minW = (parseFloat(cs.fontSize) || 20) * 15;
  const W = grid.clientWidth, H = grid.clientHeight;
  if (!W || !H) return;
  const cols = Math.max(1, Math.min(4, Math.floor((W + gap) / (minW + gap)))), colW = (W - gap * (cols - 1)) / cols;
  const place = () => {
    const hs = new Array(cols).fill(0), over = [];
    for (const el of grid.querySelectorAll(':scope > .mw')) {
      const s = Math.min(Math.max(1, +el.dataset.span || 1), cols);
      el.style.width = `${(colW * s + gap * (s - 1)).toFixed(1)}px`;
      const h = el.offsetHeight;
      let best = 0, top = Infinity;
      for (let i = 0; i + s <= cols; i++) { const t = Math.max(...hs.slice(i, i + s)); if (t < top - 1) { top = t; best = i; } }
      el.style.transform = `translate(${Math.round(best * (colW + gap))}px,${Math.round(top)}px)`;
      for (let i = best; i < best + s; i++) hs[i] = top + h + rgap;
      if (top + h > H + 1) over.push(el);
    }
    return over;
  };
  for (let n = 0; n < 120; n++) {
    const over = place();
    if (!over.length) return;
    let x = null, mini = null;
    for (const [sel, keep] of MOS_FIT) {
      if (sel === 'mini') { for (const el of over) { mini = el.querySelector('.cm-band:not(.mini)'); if (mini) break; } if (mini) break; continue; }
      for (const el of over) { const l = el.querySelectorAll(sel); if (l.length > keep) { x = l[l.length - 1]; break; } }
      if (x) break;
    }
    if (mini) { mini.classList.add('mini'); continue; }
    if (!x) { over[over.length - 1].remove(); continue; }
    const ul = x.parentElement;
    x.remove();
    // Eine Tagesliste ohne Einträge nimmt ihre Überschrift mit
    if (ul && !ul.children.length && ul.tagName === 'UL') { const h = ul.previousElementSibling; if (h && h.tagName === 'H3' && !h.classList.contains('mw-h')) h.remove(); ul.remove(); }
  }
}

/* Dieses Gerät startet im MirrorOS: zum Beispiel der Rechner hinter dem Spiegel. Wer dort ins Cockpit wechselt,
 * landet nach drei Minuten ohne Bedienung von allein wieder im MirrorOS. */
const mos = { input: Date.now() };
for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) document.addEventListener(ev, () => { mos.input = Date.now(); }, { passive: true, capture: true });
document.addEventListener('mousemove', () => { mos.input = Date.now(); }, { passive: true });
function mosIdleTick(now) {
  if (!state.ui.mosBoot || mr.on || +now - mos.input < 3 * 6e4) return;
  if (dr.open || edit.on || document.querySelector('dialog[open]')) return;
  const a = document.activeElement;
  if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
  mirrorOpen(false);
}
