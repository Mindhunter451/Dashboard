/* Abfahrten über Transitous: eine freie, nicht kommerzielle Fahrplanauskunft (MOTIS) mit offenen Daten,
 * für Deutschland aus DELFI samt Echtzeit, soweit die Verkehrsbetriebe sie liefern. Ohne Key, CORS ist offen.
 * Bedingungen von Transitous: sparsam abfragen und die Quellen sichtbar verlinken (transitous.org/sources).
 * Deshalb wird nur geladen, wenn eine Karte zu sehen ist (oder der Spiegel läuft), höchstens einmal pro Minute.
 * Jede Kopie des Widgets zeigt eine Haltestelle. Zwei Widgets mit derselben Haltestelle teilen sich die Daten. */
const TRS = 'https://api.transitous.org/api';
const DP_SRC = 'https://transitous.org/sources/';
const DP_COLOR = { s: '#0A8A4A', u: '#1660B0', bus: '#C8102E', tram: '#9E1B32', ferry: '#0A86B8', re: '#59677A', fv: '#2F3A4A' };
const DP_RAIL = new Set(['s', 'u', 're', 'fv']);
const dp = { data: {}, busy: {}, last: {}, err: {} };
const DP_ERR = {
  net: 'Keine Verbindung zur Fahrplanauskunft. Das Cockpit versucht es gleich nochmal.',
  busy: 'Die Fahrplanauskunft ist gerade überlastet. Das Cockpit versucht es gleich nochmal.',
  stop: 'Diese Haltestelle kennt die Fahrplanauskunft nicht mehr. Wähl sie in den Einstellungen neu aus.'
};

/* Liniennummer kurz und so, wie sie an der Haltestelle steht: „S1“, „U3“, „5“, „RE 3“ wird „RE3“ */
function dpLine(st) {
  let n = String(st.displayName || st.routeShortName || st.tripShortName || '').trim();
  n = n.replace(/^(Bus|STR|Tram)\s+(?=\S)/i, '').replace(/^(S|U|RE|RB|A)\s+(?=\d)/i, '$1');
  return n.slice(0, 10) || '?';
}
function dpCat(mode, line) {
  if (/^S\d/i.test(line)) return 's';
  if (/^U\d/i.test(line)) return 'u';
  if (/^(ICE|IC|EC|ECE|EN|NJ|RJX?|FLX|TGV|IR)\b/i.test(line) || ['HIGHSPEED_RAIL', 'LONG_DISTANCE', 'NIGHT_RAIL'].includes(mode)) return 'fv';
  if (mode === 'SUBURBAN' || mode === 'METRO') return 's';
  if (mode === 'SUBWAY') return 'u';
  if (mode === 'TRAM') return 'tram';
  if (mode === 'FERRY') return 'ferry';
  if (/RAIL|FUNICULAR/.test(mode || '')) return 're';
  return 'bus';
}
/* Linienfarbe aus den Fahrplandaten, sonst die Farbe des Verkehrsmittels. Schrift hell oder dunkel je nach Hintergrund. */
function dpInk(hex) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#111' : '#fff';
}
function dpColor(st, cat) {
  const c = /^#?([0-9a-f]{6})$/i.exec(st.routeColor || ''), t = /^#?([0-9a-f]{6})$/i.exec(st.routeTextColor || '');
  if (c && !/^(000000|ffffff)$/i.test(c[1])) {
    const bg = '#' + c[1];
    return [bg, t && t[1].toLowerCase() !== c[1].toLowerCase() ? '#' + t[1] : dpInk(bg)];
  }
  return [DP_COLOR[cat], '#fff'];
}
/* Nur das behalten, was die Karte braucht */
function dpSlim(st) {
  const p = st && st.place;
  if (!p) return null;
  const t = Date.parse(p.departure || p.scheduledDeparture), s = Date.parse(p.scheduledDeparture || p.departure);
  if (!Number.isFinite(t)) return null;
  const line = dpLine(st), cat = dpCat(st.mode, line), [bg, fg] = dpColor(st, cat);
  const to = String(st.headsign || (st.tripTo && st.tripTo.name) || '').replace(/^Hamburg,\s*/, '').trim();
  return {
    t, s: Number.isFinite(s) ? s : t, rt: !!st.realTime, x: !!(st.cancelled || st.tripCancelled || p.cancelled),
    line, cat, bg, fg, to: to.slice(0, 60), tr: String(p.track || '').slice(0, 8), str: String(p.scheduledTrack || '').slice(0, 8)
  };
}
/* Hinweise der Verkehrsbetriebe zur Haltestelle, jeder nur einmal */
function dpAlerts(list) {
  const out = [], seen = new Set();
  for (const st of list) {
    for (const a of (st.place && st.place.alerts) || []) {
      const h = String(a.headerText || '').trim(), d = String(a.descriptionText || '').trim();
      const k = (h || d).slice(0, 120);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push({ h: (h || d).slice(0, 200), d: h && d && d !== h ? d.slice(0, 1200) : '' });
      if (out.length >= 3) return out;
    }
  }
  return out;
}
const dpNeed = c => (c.lines || c.dir || c.modes.length < Object.keys(DP_CATS).length || c.walk >= 10 ? 60 : 30);
async function dpLoad(stop, need) {
  const k = stop.id;
  if (dp.busy[k]) return;
  dp.busy[k] = true;
  dp.last[k] = Date.now();
  const q = new URLSearchParams({ stopId: stop.id, n: String(need), language: 'de' });
  try {
    let j;
    try { j = await getJson(`${TRS}/v5/stoptimes?${q}`, 15000); }
    catch (e) {
      // IDs von Haltestellen ändern sich manchmal mit neuen Fahrplandaten. Dann über die Koordinaten suchen.
      if (!/HTTP (400|404|422)/.test(e.message) || stop.lat == null) throw e;
      q.delete('stopId');
      q.set('center', `${stop.lat},${stop.lon}`);
      q.set('radius', '120');
      j = await getJson(`${TRS}/v5/stoptimes?${q}`, 15000);
    }
    if (!j || !Array.isArray(j.stopTimes)) throw new Error('format');
    dp.data[k] = { at: Date.now(), need, list: j.stopTimes.map(dpSlim).filter(Boolean).sort((a, b) => a.t - b.t), alerts: dpAlerts(j.stopTimes) };
    dp.err[k] = '';
  } catch (e) {
    const m = String(e && e.message);
    dp.err[k] = /HTTP 429|HTTP 503/.test(m) ? DP_ERR.busy : /HTTP (400|404|422)/.test(m) ? DP_ERR.stop : DP_ERR.net;
  }
  dp.busy[k] = false;
  renderDepAll();
}
/* Gefiltert nach Verkehrsmittel, Linie und Richtung. Mit Fußweg fallen Abfahrten weg, die du nicht mehr schaffst. */
function dpRows(D, c, now) {
  const lines = c.lines ? c.lines.toUpperCase().split(/[,;]+/).map(x => x.replace(/\s+/g, '')).filter(Boolean) : [];
  const dirs = c.dir ? c.dir.toLowerCase().split(/[,;]+/).map(x => x.trim()).filter(Boolean) : [];
  const walk = c.walk * 6e4;
  return D.list.filter(r => c.modes.includes(r.cat)
    && (!lines.length || lines.includes(r.line.toUpperCase().replace(/\s+/g, '')))
    && (!dirs.length || dirs.some(x => r.to.toLowerCase().includes(x)))
    && r.t - walk >= now - 3e4);
}
const dpWhen = (r, now) => {
  const m = Math.floor((r.t - now) / 6e4);
  return m < 1 ? '<b>jetzt</b>' : m < 60 ? `<b>${m}</b><small>Min</small>` : `<b>${hm(new Date(r.t))}</b>`;
};
const dpBadge = r => `<span class="dp-line" style="--lc:${r.bg};--lt:${r.fg}">${esc(r.line)}</span>`;
function dpRowHtml(r, now) {
  const delay = r.rt ? Math.round((r.t - r.s) / 6e4) : 0;
  const plat = r.tr ? `<span class="${r.str && r.str !== r.tr ? 'dp-chg' : ''}">${DP_RAIL.has(r.cat) ? 'Gl.' : 'Steig'} ${esc(r.tr)}</span>` : '';
  const late = r.x ? '<span class="dp-x">fällt aus</span>' : delay >= 1 ? `<span class="dp-late${delay >= 5 ? ' big' : ''}">+${delay}</span>` : '';
  return `<li class="dp-row${r.x ? ' x' : ''}">${dpBadge(r)}<span class="dp-main"><b>${esc(r.to || 'Ohne Ziel')}</b><small><span class="dp-hm">${hm(new Date(r.s))}</span>${late}${plat}</small></span><span class="dp-in">${r.x ? '' : dpWhen(r, now)}</span></li>`;
}
function renderDep(v) {
  const w = state.widgets[v.id];
  if (!w) return;
  const c = w.cfg, st = c.stop, now = Date.now();
  v.q('[data-r="title"]').textContent = w.title || (st ? st.name : 'Abfahrten');
  v.q('[data-r="setup"]').hidden = !!st;
  v.q('[data-r="live"]').hidden = !st;
  if (!st) { v.q('[data-r="rt"]').innerHTML = ''; v.q('[data-r="src"]').innerHTML = ''; return; }
  const D = dp.data[st.id], err = dp.err[st.id], busy = dp.busy[st.id];
  if (!busy && !v.el.hidden && (!D || D.need < dpNeed(c) || now - D.at > 6e4) && now - (dp.last[st.id] || 0) > (err ? 6e4 : 2e4)) setTimeout(() => dpLoad(st, Math.max(dpNeed(c), D ? D.need : 0)), 50);
  const e = v.q('[data-r="err"]');
  e.textContent = err || '';
  e.hidden = !err;
  const ul = v.q('[data-r="list"]'), go = v.q('[data-r="go"]'), al = v.q('[data-r="alerts"]');
  if (!D) {
    ul.innerHTML = busy || !err ? skelRows(Math.min(c.n, 5), 'Abfahrten werden geladen') : '<li class="empty">Noch keine Abfahrten geladen.</li>';
    go.hidden = true; al.innerHTML = ''; v.q('[data-r="rt"]').innerHTML = ''; v.q('[data-r="src"]').innerHTML = dpSrcHtml(null);
    return;
  }
  const rows = dpRows(D, c, now), shown = rows.slice(0, c.n);
  const filtered = c.lines || c.dir || c.modes.length < Object.keys(DP_CATS).length;
  ul.innerHTML = shown.length ? shown.map(r => dpRowHtml(r, now)).join('')
    : `<li class="empty">Gerade keine Abfahrten${filtered ? ', die zu deinen Filtern passen' : ''}${c.walk ? ', die du zu Fuß noch schaffst' : ''}.</li>`;
  // Wann musst du los? Nur mit Fußweg und nur für Fahrten, die nicht ausfallen
  const first = c.walk ? rows.find(r => !r.x) : null;
  go.hidden = !first;
  if (first) {
    const leave = first.t - c.walk * 6e4 - now, m = Math.floor(leave / 6e4);
    go.classList.toggle('now', m < 1);
    go.innerHTML = `<b>${m < 1 ? 'Jetzt los' : `Los in ${m} Min`}</b><span>für ${dpBadge(first)} um ${hm(new Date(first.t))}${first.to ? ` nach ${esc(first.to)}` : ''}</span>`;
  }
  al.innerHTML = D.alerts.map(a => a.d ? `<details class="dp-alert"><summary>${esc(a.h)}</summary><p>${esc(a.d)}</p></details>` : `<p class="dp-alert">${esc(a.h)}</p>`).join('');
  const rt = D.list.some(r => r.rt);
  v.q('[data-r="rt"]').innerHTML = rt ? '<span class="dp-live" title="Zeiten mit Echtzeitdaten der Verkehrsbetriebe">Live</span>'
    : '<span class="dp-plan" title="Für diese Haltestelle kommen gerade keine Echtzeitdaten, die Zeiten sind laut Fahrplan">Fahrplan</span>';
  v.q('[data-r="src"]').innerHTML = dpSrcHtml(D, err);
}
const dpSrcHtml = (D, err) => `<span>Daten: <a href="${DP_SRC}" target="_blank" rel="noopener">Transitous und offene Fahrplandaten</a></span>${D ? `<span>Stand ${hm(new Date(D.at))}${err ? ', gerade ohne Verbindung' : ''}</span>` : ''}`;
function renderDepAll() { for (const v of viewsOf('dep')) renderDep(v); renderMirror(); }

/* Für den Spiegel: das erste Abfahrten-Widget mit Haltestelle, bevorzugt von der offenen Seite */
function dpMirrorWidget() {
  const ids = [...curPage().items.map(x => x.w), ...state.pages.flatMap(p => p.items.map(x => x.w))];
  for (const id of ids) { const w = state.widgets[id]; if (w && w.type === 'dep' && w.cfg.stop) return w; }
  return null;
}
function dpMirror(now) {
  const w = dpMirrorWidget();
  if (!w) return null;
  const st = w.cfg.stop, D = dp.data[st.id], t = +now;
  if ((!D || t - D.at > 6e4) && !dp.busy[st.id] && t - (dp.last[st.id] || 0) > 6e4) setTimeout(() => dpLoad(st, Math.max(dpNeed(w.cfg), D ? D.need : 0)), 50);
  if (!D) return null;
  return { name: w.title || st.name, rows: dpRows(D, w.cfg, t).slice(0, 5), walk: w.cfg.walk };
}
/* Takt: alle 10 Sekunden die Minuten neu zeichnen, einmal pro Minute nachladen */
function dpTick(now) {
  if (now.getSeconds() % 10 || document.visibilityState !== 'visible') return;
  for (const v of viewsOf('dep')) if (!v.el.hidden) renderDep(v);
}

/* Einstellungen: Haltestelle suchen (Name oder in der Nähe), Verkehrsmittel, Fußweg, Anzahl, Linien, Richtung */
function dpBias() {
  const h = state.commute.home;
  if (h && h.lat != null) return `${h.lat},${h.lon}`;
  if (state.loc.mode === 'fixed') return `${state.loc.lat},${state.loc.lon}`;
  return wx.loc ? `${(+wx.loc.lat).toFixed(4)},${(+wx.loc.lon).toFixed(4)}` : '';
}
function dpHitArea(m) {
  const a = Array.isArray(m.areas) ? m.areas : [];
  const d = a.find(x => x.default) || a.find(x => x.adminLevel === 8) || a[0];
  return d && d.name && d.name !== m.name ? d.name : '';
}
function dpHitModes(m) {
  const cats = [...new Set((Array.isArray(m.modes) ? m.modes : []).map(x => dpCat(x, '')))];
  return cats.filter(k => DP_CATS[k]).map(k => DP_CATS[k]).join(', ');
}
async function dpSearch(box, near) {
  const hits = box.querySelector('[data-s="hits"]'), q = box.querySelector('[data-s="q"]').value.trim(), bias = dpBias();
  if (!near && q.length < 2) { hits.innerHTML = '<li class="empty">Gib mindestens zwei Buchstaben ein.</li>'; return; }
  if (near && !bias) { hits.innerHTML = '<li class="empty">Dein Ort ist noch unbekannt. Such einfach nach dem Namen der Haltestelle.</li>'; return; }
  hits.innerHTML = '<li class="empty">Suche läuft …</li>';
  const p = new URLSearchParams(near ? { place: bias, type: 'STOP', numResults: '8' } : { text: q, type: 'STOP', numResults: '8', language: 'de' });
  if (!near && bias) p.set('place', bias);
  let list;
  try { list = await getJson(`${TRS}/v1/${near ? 'reverse-geocode' : 'geocode'}?${p}`, 12000); }
  catch { if (box.isConnected) hits.innerHTML = '<li class="empty">Die Suche ist gerade nicht erreichbar. Versuch es gleich nochmal.</li>'; return; }
  if (!box.isConnected) return;
  const stops = (Array.isArray(list) ? list : []).filter(m => m && m.id && m.name && (!m.type || m.type === 'STOP')).slice(0, 8);
  box._hits = stops;
  hits.innerHTML = stops.length ? stops.map((m, i) => {
    const area = dpHitArea(m), modes = dpHitModes(m);
    return `<li><button type="button" data-hit="${i}"><b>${esc(m.name)}</b><span>${esc([area, modes].filter(Boolean).join(' · '))}</span></button></li>`;
  }).join('') : `<li class="empty">${near ? 'Keine Haltestelle in der Nähe gefunden.' : 'Nichts gefunden. Versuch es mit einem anderen Namen.'}</li>`;
}
function dpPickInfo(box) {
  const s = box._stop;
  box.querySelector('[data-s="pick"]').innerHTML = s ? `Gewählt: <b>${esc(s.name)}</b>` : 'Noch keine Haltestelle gewählt.';
}

defineWidget('dep', {
  mount(v) {
    v.q('[data-r="setup-btn"]').addEventListener('click', () => openWidgetDialog(v.id));
    v.q('[data-r="set"]').addEventListener('click', () => openWidgetDialog(v.id));
  },
  render: renderDep,
  settings: {
    render(box, w) {
      const c = w.cfg;
      box._stop = c.stop ? { ...c.stop } : null;
      box._hits = [];
      const walks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30];
      box.innerHTML = `<div class="field dp-find"><label class="lbl" for="dp-q">Haltestelle</label>
        <div class="dp-search"><input id="dp-q" data-s="q" type="search" maxlength="60" autocomplete="off" placeholder="z. B. Jungfernstieg"><button type="button" class="btn-ghost" data-s="go">Suchen</button><button type="button" class="btn-ghost" data-s="near">In der Nähe</button></div>
        <ul class="dp-hits" data-s="hits"></ul><p class="hint" data-s="pick"></p></div>
      <fieldset class="days"><legend class="lbl">Verkehrsmittel</legend>${Object.entries(DP_CATS).map(([k, n]) => `<label><input type="checkbox" data-cat="${k}"${c.modes.includes(k) ? ' checked' : ''}><span>${esc(n)}</span></label>`).join('')}</fieldset>
      <div class="grid2"><label class="field"><span class="lbl">Fußweg zur Haltestelle</span><select data-s="walk">${walks.map(m => `<option value="${m}"${m === c.walk ? ' selected' : ''}>${m ? `${m} Min` : 'Nicht berücksichtigen'}</option>`).join('')}</select></label>
      <label class="field"><span class="lbl">Wie viele Abfahrten</span><select data-s="n">${[4, 6, 8, 10].map(n => `<option value="${n}"${n === c.n ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>
      <div class="grid2"><label class="field"><span class="lbl">Nur diese Linien</span><input data-s="lines" type="text" maxlength="60" autocomplete="off" placeholder="leer = alle, z. B. S1, U3, 5" value="${esc(c.lines)}"></label>
      <label class="field"><span class="lbl">Nur in Richtung</span><input data-s="dir" type="text" maxlength="60" autocomplete="off" placeholder="leer = alle, z. B. Hauptbahnhof" value="${esc(c.dir)}"></label></div>
      <p class="hint">Mit Fußweg zeigt die Karte, wann du loslaufen musst, und blendet Fahrten aus, die du nicht mehr schaffst. Die Daten kommen von <a href="${DP_SRC}" target="_blank" rel="noopener">Transitous</a>, Haltestellen von OpenStreetMap. Echtzeit gibt es, wo die Verkehrsbetriebe sie liefern.</p>`;
      dpPickInfo(box);
      const qEl = box.querySelector('[data-s="q"]');
      qEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); dpSearch(box, false); } });
      box.querySelector('[data-s="go"]').addEventListener('click', () => dpSearch(box, false));
      box.querySelector('[data-s="near"]').addEventListener('click', () => dpSearch(box, true));
      box.querySelector('[data-s="hits"]').addEventListener('click', e => {
        const b = e.target.closest('[data-hit]'), m = b && box._hits[+b.dataset.hit];
        if (!m) return;
        box._stop = { id: m.id, name: m.name, lat: m.lat, lon: m.lon };
        for (const x of box.querySelectorAll('[data-hit]')) x.classList.toggle('on', x === b);
        dpPickInfo(box);
      });
      if (!c.stop) setTimeout(() => qEl.focus(), 50);
    },
    save(box, w) {
      if (!box._stop) return 'Such zuerst deine Haltestelle und tipp sie in der Liste an.';
      const modes = [...box.querySelectorAll('[data-cat]')].filter(x => x.checked).map(x => x.dataset.cat);
      if (!modes.length) return 'Wähl mindestens ein Verkehrsmittel aus.';
      w.cfg.stop = box._stop;
      w.cfg.modes = modes;
      w.cfg.walk = +box.querySelector('[data-s="walk"]').value || 0;
      w.cfg.n = +box.querySelector('[data-s="n"]').value || 6;
      w.cfg.lines = box.querySelector('[data-s="lines"]').value.trim();
      w.cfg.dir = box.querySelector('[data-s="dir"]').value.trim();
      return null;
    }
  }
});
