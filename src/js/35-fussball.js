/* Fußball über OpenLigaDB (kostenlos, ohne Key). Jede Kopie zeigt eine Liga, optional mit Lieblingsverein.
 * Die ganze Saison wird alle 15 Minuten geladen, der laufende Spieltag öfter, während Spielen jede Minute. */
const OLDB = 'https://api.openligadb.de';
const fbs = {};
const fbData = lg => fbs[lg] || (fbs[lg] = { season: 0, matches: null, table: null, scorers: null, cur: null, at: 0, busy: null, err: null, timer: null });
const fbLeagues = () => [...new Set(widgetsOf('football').map(([, w]) => w.cfg.league))];
const kick = m => Date.parse(m.matchDateTimeUTC || m.matchDateTime);
const fbIsLive = (m, t) => !m.matchIsFinished && t >= kick(m) && t < kick(m) + 150 * 6e4;
function fbScore(m) {
  const res = m.matchResults || [];
  const end = res.find(r => r.resultTypeID === 2);
  if (m.matchIsFinished && end) return [end.pointsTeam1, end.pointsTeam2];
  const g = (m.goals || []).filter(x => Number.isFinite(x.scoreTeam1) && Number.isFinite(x.scoreTeam2)).slice(-1)[0];
  if (g) return [g.scoreTeam1, g.scoreTeam2];
  const any = res.slice().sort((a, b) => b.resultOrderID - a.resultOrderID)[0];
  if (any) return [any.pointsTeam1, any.pointsTeam2];
  return Date.now() >= kick(m) ? [0, 0] : null;
}
function fbRes(m, id) {
  const s = fbScore(m);
  if (!s || !m.matchIsFinished) return null;
  const [a, b] = m.team1.teamId === id ? s : [s[1], s[0]];
  return a > b ? 'S' : a < b ? 'N' : 'U';
}
const fbTeamMatches = (D, id) => (D.matches || []).filter(m => m.team1.teamId === id || m.team2.teamId === id).sort((a, b) => kick(a) - kick(b));
const fbIni = n => { n = String(n || '').trim(); return /^[A-ZÄÖÜ0-9]{2,4}$/.test(n) ? n : n.split(/\s+/).filter(w => /^\p{L}/u.test(w)).map(w => w[0]).join('').slice(0, 2).toUpperCase(); };
/* Vereinslogo. Lädt es nicht, springt ein Kreis mit Kürzel ein (siehe Fehler-Listener unten) */
const fbLogo = (url, cls, name) => `<img class="logo${cls ? ' ' + cls : ''}" src="${esc(safeImg(url))}" alt="" loading="lazy" referrerpolicy="no-referrer" data-ini="${esc(fbIni(name))}">`;
document.addEventListener('error', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains('logo')) return;
  const s = document.createElement('span');
  s.className = `${img.className} ini`;
  s.textContent = img.dataset.ini || '';
  s.setAttribute('aria-hidden', 'true');
  img.replaceWith(s);
}, true);
const fbTeamBtn = (t, lg, right) => `<button type="button" class="fb-t${right ? ' r' : ''}" data-fbteam="${t.teamId}" data-lg="${lg}">${right ? '' : fbLogo(t.teamIconUrl, '', t.shortName || t.teamName)}<span>${esc(t.shortName || t.teamName)}</span>${right ? fbLogo(t.teamIconUrl, '', t.shortName || t.teamName) : ''}</button>`;
const fbFormHtml = list => `<span class="form" aria-label="Form: ${list.map(r => ({ S: 'Sieg', U: 'Unentschieden', N: 'Niederlage' }[r])).join(', ')}">${list.map(r => `<i data-res="${r}">${r}</i>`).join('')}</span>`;
function fbZone(lg, pos, n) {
  if (lg === 'bl1') return pos <= 4 ? 'up' : pos <= 6 ? 'eu' : pos === 16 ? 'rel' : pos >= 17 ? 'down' : '';
  if (lg === 'bl2') return pos <= 2 ? 'up' : pos === 3 || pos === 16 ? 'rel' : pos >= 17 ? 'down' : '';
  return pos <= 2 ? 'up' : pos === 3 ? 'rel' : pos > n - 4 ? 'down' : '';
}
const FB_ZONES = {
  bl1: [['--good', 'Champions League'], ['--sea', 'Europa und Conference League'], ['--warn', 'Relegation'], ['--bad', 'Abstieg']],
  bl2: [['--good', 'Aufstieg'], ['--warn', 'Relegation'], ['--bad', 'Abstieg']],
  bl3: [['--good', 'Aufstieg'], ['--warn', 'Relegation'], ['--bad', 'Abstieg']]
};

function fbLoad(lg, full) {
  const D = fbData(lg);
  if (D.busy) return D.busy;
  D.busy = (async () => {
    try {
      const cur = await getJson(`${OLDB}/getmatchdata/${lg}`, 12000);
      const now = new Date();
      const season = (Array.isArray(cur) && cur[0] && cur[0].leagueSeason) || D.season || (now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1);
      if (Array.isArray(cur) && cur[0] && cur[0].group) D.cur = cur[0].group;
      if (full || !D.matches || D.season !== season || Date.now() - D.at > 15 * 6e4) {
        const [all, table, sc] = await Promise.all([
          getJson(`${OLDB}/getmatchdata/${lg}/${season}`, 25000),
          getJson(`${OLDB}/getbltable/${lg}/${season}`, 12000).catch(() => null),
          getJson(`${OLDB}/getgoalgetters/${lg}/${season}`, 12000).catch(() => null)
        ]);
        D.matches = Array.isArray(all) ? all : [];
        if (Array.isArray(table)) D.table = table;
        if (Array.isArray(sc)) D.scorers = sc;
        D.season = season;
        D.at = Date.now();
      } else if (Array.isArray(cur)) {
        // Nur den laufenden Spieltag und die Tabelle auffrischen
        const byId = new Map(cur.map(m => [m.matchID, m]));
        D.matches = D.matches.map(m => byId.get(m.matchID) || m);
        const table = await getJson(`${OLDB}/getbltable/${lg}/${season}`, 12000).catch(() => null);
        if (Array.isArray(table)) D.table = table;
      }
      D.err = null;
    } catch (e) { D.err = e || new Error('Fehler'); }
    finally { D.busy = null; D.tried = Date.now(); renderFootballAll(); fbPlan(lg); }
  })();
  return D.busy;
}
function fbPlan(lg) {
  const D = fbData(lg), t = Date.now();
  clearTimeout(D.timer);
  const ms = D.matches || [];
  const live = ms.some(m => fbIsLive(m, t));
  const soon = ms.some(m => !m.matchIsFinished && kick(m) > t && kick(m) - t < 15 * 6e4);
  const wait = live ? 6e4 : soon ? 2 * 6e4 : D.err ? 3 * 6e4 : 10 * 6e4;
  D.timer = setTimeout(() => {
    if (!fbLeagues().includes(lg)) return;
    if (document.visibilityState === 'visible') fbLoad(lg); else fbPlan(lg);
  }, wait);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  for (const lg of fbLeagues()) { const D = fbData(lg); if (D.tried && Date.now() - D.tried > 2 * 6e4) fbLoad(lg); }
});
const renderFootballAll = () => viewsOf('football').forEach(renderFootball);

function fbMatchBox(m, lg, now) {
  const live = fbIsLive(m, now), s = fbScore(m), d = new Date(kick(m));
  const started = now >= kick(m);
  let mid;
  if (s && (m.matchIsFinished || started)) mid = `<b>${s[0]}:${s[1]}</b><small>${live ? `Anpfiff ${hm(d)}` : `${WD[d.getDay()]} ${dm(d)}`}</small>`;
  else {
    const n = dayDiff(new Date(now), d);
    mid = `<b>${hm(d)}</b><small>${WD[d.getDay()]} ${dm(d)}</small><small>${n === 0 ? 'heute' : n === 1 ? 'morgen' : `in ${n} Tagen`}</small>`;
  }
  const side = t => `<button type="button" class="fb-side" data-fbteam="${t.teamId}" data-lg="${lg}">${fbLogo(t.teamIconUrl, 'lg', t.shortName || t.teamName)}<span>${esc(t.shortName || t.teamName)}</span></button>`;
  return `<div class="fb-next">${side(m.team1)}<div class="fb-mid">${mid}</div>${side(m.team2)}</div>`;
}
function fbFavHtml(D, c, lg, now) {
  const id = c.team;
  if (!id) {
    const opts = (D.table || []).map(r => `<option value="${r.teamInfoId}">${esc(r.teamName)}</option>`).join('');
    return `<label class="field"><span class="lbl">Dein Verein</span><select data-fbpick><option value="0">Wähl deinen Verein</option>${opts}</select></label>`;
  }
  const row = (D.table || []).find(r => r.teamInfoId === id);
  const ms = fbTeamMatches(D, id);
  const t0 = ms[0] ? (ms[0].team1.teamId === id ? ms[0].team1 : ms[0].team2) : null;
  if (!row && !t0) return `<p class="hint">${esc(c.teamName || 'Dein Verein')} spielt in dieser Saison nicht in der ${esc(FB_LEAGUES[lg])}. Stell unter Bearbeiten, Einstellungen eine andere Liga ein.</p>`;
  const name = row ? row.teamName : t0.teamName, icon = row ? row.teamIconUrl : t0.teamIconUrl;
  const pos = row ? D.table.indexOf(row) + 1 : null;
  const form = ms.filter(m => m.matchIsFinished).slice(-5).map(m => fbRes(m, id)).filter(Boolean);
  const live = ms.find(m => fbIsLive(m, now));
  const next = live || ms.find(m => !m.matchIsFinished && kick(m) > now - 150 * 6e4);
  const last = [...ms].reverse().find(m => m.matchIsFinished);
  const show = live || next || last;
  const lbl = live ? '<span class="live">Live</span>' : next ? 'Nächstes Spiel' : last ? 'Letztes Spiel' : '';
  const sub = row ? `Platz ${pos} · ${row.points} ${row.points === 1 ? 'Punkt' : 'Punkte'} · ${row.matches} ${row.matches === 1 ? 'Spiel' : 'Spiele'}` : '';
  return `<div class="fb-top"><button type="button" class="fb-head" data-fbteam="${id}" data-lg="${lg}">${fbLogo(icon, 'lg', row ? row.shortName : t0.shortName)}<span><b>${esc(name)}</b><small>${esc(sub)}</small></span></button>${form.length ? fbFormHtml(form) : ''}</div>`
    + (show ? `<p class="fb-label">${lbl}</p>${fbMatchBox(show, lg, now)}` : '');
}
function fbDayHtml(v, D, lg, fav, now) {
  const groups = [...new Set((D.matches || []).map(m => m.group.groupOrderID))].sort((a, b) => a - b);
  if (!groups.length) return '<p class="empty">Noch keine Spiele angesetzt.</p>';
  const curG = D.cur ? D.cur.groupOrderID : groups[0];
  // Folgt dem aktuellen Spieltag, bis du selbst blätterst
  if (!v.mdUser || !groups.includes(v.md)) v.md = groups.includes(curG) ? curG : groups[0];
  const ms = D.matches.filter(m => m.group.groupOrderID === v.md).sort((a, b) => kick(a) - kick(b));
  const name = ms[0] ? ms[0].group.groupName : `${v.md}. Spieltag`;
  let html = `<div class="fb-nav"><button type="button" class="icon-btn" data-fbmd="-1" aria-label="Spieltag davor"${v.md === groups[0] ? ' disabled' : ''}>${LEFT}</button><p class="sub-h">${esc(name)}${v.md === curG ? ' · aktuell' : ''}</p><button type="button" class="icon-btn" data-fbmd="1" aria-label="Spieltag danach"${v.md === groups[groups.length - 1] ? ' disabled' : ''}>${RIGHT}</button></div><ul class="fb-list">`;
  let day = '';
  for (const m of ms) {
    const d = new Date(kick(m)), k = ymd(d);
    if (k !== day) { day = k; html += `<li class="fb-day">${WDL[d.getDay()]}, ${dm(d)}</li>`; }
    const s = fbScore(m), live = fbIsLive(m, now), started = now >= kick(m);
    const sc = s && (m.matchIsFinished || started) ? `<span class="fb-sc"${live ? ' data-live' : ''}${live ? ' title="Läuft gerade"' : ''}>${s[0]}:${s[1]}</span>` : `<span class="fb-sc time">${hm(d)}</span>`;
    const isFav = fav && (m.team1.teamId === fav || m.team2.teamId === fav);
    html += `<li class="fb-row${isFav ? ' fav' : ''}">${fbTeamBtn(m.team1, lg)}${sc}${fbTeamBtn(m.team2, lg, true)}</li>`;
  }
  return html + '</ul>';
}
function fbTableHtml(D, lg, fav) {
  if (!D.table || !D.table.length) return '<p class="empty">Die Tabelle gibt es, sobald gespielt wurde.</p>';
  const n = D.table.length;
  const rows = D.table.map((r, i) => {
    const t = { teamId: r.teamInfoId, teamName: r.teamName, shortName: r.shortName, teamIconUrl: r.teamIconUrl };
    return `<tr${r.teamInfoId === fav ? ' class="fav"' : ''} data-z="${fbZone(lg, i + 1, n)}"><td class="pos">${i + 1}</td><td class="n">${fbTeamBtn(t, lg)}</td><td>${r.matches}</td><td class="hide-s">${r.goals}:${r.opponentGoals}</td><td>${r.goalDiff > 0 ? '+' : ''}${r.goalDiff}</td><td class="p">${r.points}</td></tr>`;
  }).join('');
  const leg = (FB_ZONES[lg] || []).map(([c, t]) => `<li><i style="--c:var(${c})"></i>${esc(t)}</li>`).join('');
  return `<table class="fb-table"><thead><tr><th>#</th><th class="n">Verein</th><th title="Spiele">Sp</th><th class="hide-s">Tore</th><th title="Tordifferenz">Diff</th><th title="Punkte">Pkt</th></tr></thead><tbody>${rows}</tbody></table><ul class="fb-legend">${leg}</ul>`;
}
/* Torjäger mit Verein: der Verein kommt aus den Toren der Saison */
function fbScorerTeams(D) {
  const teams = new Map(), cnt = new Map();
  for (const m of D.matches || []) {
    teams.set(m.team1.teamId, m.team1); teams.set(m.team2.teamId, m.team2);
    for (const g of m.goals || []) {
      if (g.isOwnGoal || !g.goalGetterID) continue;
      const k = `${g.goalGetterID}:${g.scoringTeamId}`;
      cnt.set(k, (cnt.get(k) || 0) + 1);
    }
  }
  const best = new Map();
  for (const [k, n] of cnt) { const [p, t] = k.split(':').map(Number); if (!best.has(p) || best.get(p).n < n) best.set(p, { t, n }); }
  return id => { const b = best.get(id); return b ? teams.get(b.t) : null; };
}
function fbScorersHtml(D, lg) {
  const list = (D.scorers || []).slice().sort((a, b) => b.goalCount - a.goalCount).slice(0, 12);
  if (!list.length) return '<p class="empty">Noch keine Tore.</p>';
  const teamOf = fbScorerTeams(D);
  let rank = 0, prev = -1;
  return `<ul class="st-list">${list.map((s, i) => {
    if (s.goalCount !== prev) { rank = i + 1; prev = s.goalCount; }
    const t = teamOf(s.goalGetterId);
    return `<li><div class="st-row"><span class="st-pos">${rank}.</span><span class="st-name">${t ? fbLogo(t.teamIconUrl, '', t.shortName || t.teamName) : ''}<span><b>${esc(s.goalGetterName)}</b>${t ? `<small>${esc(t.shortName || t.teamName)}</small>` : ''}</span></span><span class="st-pts">${s.goalCount} ${s.goalCount === 1 ? 'Tor' : 'Tore'}</span></div></li>`;
  }).join('')}</ul>`;
}
function renderFootball(v) {
  const w = state.widgets[v.id];
  if (!w) return;
  const c = w.cfg, lg = c.league, D = fbData(lg), q = v.q, now = Date.now();
  q('[data-r="title"]').textContent = w.title || FB_LEAGUES[lg];
  if (!D.matches && !D.busy && (!D.tried || now - D.tried > 6e4)) fbLoad(lg);
  q('[data-r="md"]').textContent = D.cur ? D.cur.groupName : '';
  const body = q('[data-r="body"]'), fav = q('[data-r="fav"]');
  if (!D.matches) {
    fav.innerHTML = '';
    body.innerHTML = D.err && !D.busy ? '<div class="wx-off"><h3>Fußballdaten gerade nicht erreichbar</h3><p>OpenLigaDB antwortet nicht. In ein paar Minuten gibt es automatisch einen neuen Versuch.</p></div>' : '<p class="hint">Spiele und Tabelle werden geladen …</p>';
    q('[data-r="tabs"]').hidden = true;
    q('[data-r="src"]').textContent = '';
    return;
  }
  q('[data-r="tabs"]').hidden = false;
  fav.innerHTML = fbFavHtml(D, c, lg, now);
  v.tab = v.tab || 'day';
  segSet(q('[data-r="tabs"]'), v.tab);
  body.innerHTML = v.tab === 'table' ? fbTableHtml(D, lg, c.team) : v.tab === 'scorers' ? fbScorersHtml(D, lg) : fbDayHtml(v, D, lg, c.team, now);
  q('[data-r="src"]').textContent = `Stand ${hm(new Date(D.tried || D.at))} Uhr${D.err ? ', Aktualisieren hat gerade nicht geklappt' : ''} · Daten: OpenLigaDB`;
}

/* Infofenster zu einem Verein */
function fbTeamInfo(lg, id) {
  const D = fbData(lg), key = `fb:${lg}:${id}`, now = Date.now();
  const row = (D.table || []).find(r => r.teamInfoId === id);
  const ms = fbTeamMatches(D, id);
  const t0 = ms[0] ? (ms[0].team1.teamId === id ? ms[0].team1 : ms[0].team2) : null;
  if (!row && !t0) return;
  const name = row ? row.teamName : t0.teamName, icon = row ? row.teamIconUrl : t0.teamIconUrl;
  const pos = row ? D.table.indexOf(row) + 1 : null;
  const done = ms.filter(m => m.matchIsFinished), open = ms.filter(m => !m.matchIsFinished);
  const form = done.slice(-5).map(m => fbRes(m, id)).filter(Boolean);
  const line = m => {
    const home = m.team1.teamId === id, opp = home ? m.team2 : m.team1, d = new Date(kick(m)), s = fbScore(m);
    const sc = s && (m.matchIsFinished || now >= kick(m)) ? (home ? `${s[0]}:${s[1]}` : `${s[1]}:${s[0]}`) : hm(d);
    const res = fbRes(m, id);
    return `<li><button type="button" data-fbteam="${opp.teamId}" data-lg="${lg}">${fbLogo(opp.teamIconUrl, '', opp.shortName || opp.teamName)}<span>${home ? 'gegen' : 'bei'} ${esc(opp.shortName || opp.teamName)}</span></button><span class="d">${WD[d.getDay()]} ${dmy(d)}</span><span class="s"${res ? ` style="color:var(${res === 'S' ? '--good' : res === 'N' ? '--bad' : '--muted'})"` : ''}>${sc}</span></li>`;
  };
  // Torschützen des Vereins aus den Toren der Saison
  const sc = new Map();
  for (const m of done) for (const g of m.goals || []) if (g.scoringTeamId === id && !g.isOwnGoal && g.goalGetterName) sc.set(g.goalGetterName, (sc.get(g.goalGetterName) || 0) + 1);
  const scorers = [...sc].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const stat = (l, x) => `<div><span>${l}</span><b>${x}</b></div>`;
  const html = `<div class="in-head">${fbLogo(icon, 'xl', row ? row.shortName : t0.shortName)}<div><b>${esc(name)}</b><small>${esc(FB_LEAGUES[lg])} ${D.season}/${String(D.season + 1).slice(2)}${pos ? ` · Platz ${pos}` : ''}</small></div></div>`
    + (row ? `<div class="in-stats">${stat('Punkte', row.points)}${stat('Spiele', row.matches)}${stat('S / U / N', `${row.won} / ${row.draw} / ${row.lost}`)}${stat('Tore', `${row.goals}:${row.opponentGoals}`)}</div>` : '')
    + (form.length ? `<div class="in-sec"><h3>Form, letzte ${form.length} Spiele</h3>${fbFormHtml(form)}</div>` : '')
    + (open.length ? `<div class="in-sec"><h3>Nächste Spiele</h3><ul class="in-res">${open.slice(0, 3).map(line).join('')}</ul></div>` : '')
    + (done.length ? `<div class="in-sec"><h3>Letzte Ergebnisse</h3><ul class="in-res">${done.slice(-5).reverse().map(line).join('')}</ul></div>` : '')
    + (scorers.length ? `<div class="in-sec"><h3>Torschützen</h3><ul class="in-res">${scorers.map(([n, k]) => `<li><span>${esc(n)}</span><span></span><span class="s">${k}</span></li>`).join('')}</ul></div>` : '')
    + '<div class="in-sec in-wiki" data-r="wiki"></div>';
  openInfo(key, name, html, wikiSummary([name]).then(r => r || wikiSearch(`${name} Fußballverein`).then(t => t ? wikiSummary([t]) : null)));
}
$('#info-body').addEventListener('click', e => {
  const b = e.target.closest('[data-fbteam]');
  if (b && b.dataset.lg) fbTeamInfo(b.dataset.lg, +b.dataset.fbteam);
});

defineWidget('football', {
  mount(v) {
    v.tab = 'day';
    v.md = null;
    v.el.addEventListener('click', e => {
      const t = e.target.closest('[data-fbteam]');
      if (t) return fbTeamInfo(t.dataset.lg, +t.dataset.fbteam);
      const tab = e.target.closest('[data-r="tabs"] [data-v]');
      if (tab) { v.tab = tab.dataset.v; renderFootball(v); return; }
      const nav = e.target.closest('[data-fbmd]');
      if (nav && !nav.disabled) {
        const D = fbData(state.widgets[v.id].cfg.league);
        const groups = [...new Set((D.matches || []).map(m => m.group.groupOrderID))].sort((a, b) => a - b);
        const i = groups.indexOf(v.md) + (+nav.dataset.fbmd);
        if (i >= 0 && i < groups.length) { v.md = groups[i]; v.mdUser = true; renderFootball(v); const b = v.q(`[data-fbmd="${nav.dataset.fbmd}"]`); if (b && !b.disabled) b.focus(); }
      }
    });
    v.el.addEventListener('change', e => {
      if (!e.target.matches('[data-fbpick]')) return;
      const id = +e.target.value, w = state.widgets[v.id];
      if (!id || !w) return;
      const row = (fbData(w.cfg.league).table || []).find(r => r.teamInfoId === id);
      w.cfg.team = id;
      w.cfg.teamName = row ? row.teamName : '';
      commit();
    });
  },
  render: renderFootball,
  settings: {
    render(box, w) {
      box.innerHTML = `<label class="field"><span class="lbl">Liga</span><select data-s="lg">${Object.entries(FB_LEAGUES).map(([k, n]) => `<option value="${k}"${k === w.cfg.league ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label><label class="field"><span class="lbl">Lieblingsverein</span><select data-s="team"></select></label><p class="hint" data-s="hint"></p>`;
      const sel = box.querySelector('[data-s="team"]');
      const fill = (lg, keep) => {
        const D = fbData(lg);
        sel.textContent = '';
        sel.add(new Option('Keiner', '0'));
        for (const r of D.table || []) sel.add(new Option(r.teamName, String(r.teamInfoId)));
        sel.value = String(keep || 0);
        if (!sel.value) sel.value = '0';
        box.querySelector('[data-s="hint"]').textContent = D.table ? '' : 'Vereine werden geladen …';
        if (!D.table && !D.busy) fbLoad(lg).then(() => { if (box.isConnected && box.querySelector('[data-s="lg"]').value === lg) fill(lg, sel.value); });
      };
      fill(w.cfg.league, w.cfg.team);
      box.querySelector('[data-s="lg"]').addEventListener('change', e => fill(e.target.value, 0));
    },
    save(box, w) {
      const lg = box.querySelector('[data-s="lg"]').value, sel = box.querySelector('[data-s="team"]'), id = +sel.value || 0;
      w.cfg.league = FB_LEAGUES[lg] ? lg : 'bl1';
      w.cfg.team = id;
      w.cfg.teamName = id && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].text : '';
      queueMicrotask(() => fbLoad(w.cfg.league));
      return null;
    }
  }
});
