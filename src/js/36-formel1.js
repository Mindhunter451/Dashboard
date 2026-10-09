/* Formel 1 über Jolpica (Nachfolger der Ergast API, kostenlos, ohne Key). Live-Zeiten gibt es dort nicht,
 * Ergebnisse kommen kurz nach der Session. Alle Zeiten werden in deine Ortszeit umgerechnet. */
const JOL = 'https://api.jolpi.ca/ergast/f1';
const f1 = { races: null, drivers: [], teams: [], last: null, season: '', round: '', at: 0, tried: 0, busy: null, err: null, tab: 'drivers', all: false, timer: null, minute: -1 };
const F1_SESS = [['FirstPractice', '1. Training', 60], ['SecondPractice', '2. Training', 60], ['ThirdPractice', '3. Training', 60], ['SprintQualifying', 'Sprint-Qualifying', 45], ['SprintShootout', 'Sprint-Shootout', 45], ['Sprint', 'Sprint', 60], ['Qualifying', 'Qualifying', 60]];
const F1_COLOR = { mercedes: '#27F4D2', ferrari: '#E8002D', mclaren: '#FF8000', red_bull: '#3671C6', rb: '#6692FF', alpine: '#FF87BC', haas: '#B6BABD', audi: '#BB0A30', sauber: '#52E252', williams: '#64C4FF', aston_martin: '#229971', cadillac: '#A8A9AD' };
const NAT_DE = { Argentine: 'Argentinien', Argentinian: 'Argentinien', Australian: 'Australien', Austrian: 'Österreich', Belgian: 'Belgien', Brazilian: 'Brasilien', British: 'Großbritannien', Canadian: 'Kanada', Chinese: 'China', Danish: 'Dänemark', Dutch: 'Niederlande', Finnish: 'Finnland', French: 'Frankreich', German: 'Deutschland', Indian: 'Indien', Irish: 'Irland', Italian: 'Italien', Japanese: 'Japan', Mexican: 'Mexiko', Monegasque: 'Monaco', 'New Zealander': 'Neuseeland', Polish: 'Polen', Russian: 'Russland', Spanish: 'Spanien', Swedish: 'Schweden', Swiss: 'Schweiz', Thai: 'Thailand', American: 'USA', Estonian: 'Estland', Israeli: 'Israel' };
const COUNTRY_DE = { Australia: 'Australien', Austria: 'Österreich', Azerbaijan: 'Aserbaidschan', Bahrain: 'Bahrain', Belgium: 'Belgien', Brazil: 'Brasilien', Canada: 'Kanada', China: 'China', Hungary: 'Ungarn', Italy: 'Italien', Japan: 'Japan', Malaysia: 'Malaysia', Mexico: 'Mexiko', Monaco: 'Monaco', Netherlands: 'Niederlande', Portugal: 'Portugal', Qatar: 'Katar', 'Saudi Arabia': 'Saudi-Arabien', Singapore: 'Singapur', Spain: 'Spanien', UAE: 'Vereinigte Arabische Emirate', UK: 'Großbritannien', USA: 'USA', 'United States': 'USA', Germany: 'Deutschland', France: 'Frankreich', Turkey: 'Türkei', Argentina: 'Argentinien', 'South Africa': 'Südafrika', Korea: 'Südkorea', India: 'Indien', Russia: 'Russland', Vietnam: 'Vietnam', Thailand: 'Thailand' };
const f1When = o => o && o.date ? new Date(`${o.date}T${o.time || '12:00:00Z'}`) : null;
const f1Short = n => String(n || '').replace(/ Grand Prix/, ' GP');
const f1Name = d => `${d.givenName} ${d.familyName}`;
function f1Sessions(r) {
  const out = F1_SESS.filter(([k]) => r[k]).map(([k, name, min]) => ({ name, at: f1When(r[k]), min }));
  out.push({ name: 'Rennen', at: f1When(r), min: 120, race: true });
  return out.filter(s => s.at).sort((a, b) => a.at - b.at);
}
/* Nächstes Rennen: das erste, das noch nicht seit drei Stunden vorbei ist */
const f1Next = now => (f1.races || []).find(r => { const t = f1When(r); return t && t.getTime() + 3 * 36e5 > now; }) || null;

function f1Load(force) {
  if (f1.busy) return f1.busy;
  f1.busy = (async () => {
    try {
      const s = await getJson(`${JOL}/current.json`, 15000);
      const [d, t, l] = await Promise.all([
        getJson(`${JOL}/current/driverStandings.json`, 15000).catch(() => null),
        getJson(`${JOL}/current/constructorStandings.json`, 15000).catch(() => null),
        getJson(`${JOL}/current/last/results.json`, 15000).catch(() => null)
      ]);
      const RT = s && s.MRData && s.MRData.RaceTable;
      f1.races = RT && Array.isArray(RT.Races) ? RT.Races : [];
      f1.season = RT ? RT.season : '';
      const dl = d && d.MRData.StandingsTable.StandingsLists[0];
      f1.drivers = dl ? dl.DriverStandings : [];
      f1.round = dl ? dl.round : '';
      const tl = t && t.MRData.StandingsTable.StandingsLists[0];
      f1.teams = tl ? tl.ConstructorStandings : [];
      const lr = l && l.MRData.RaceTable.Races[0];
      f1.last = lr && lr.season === f1.season ? lr : null;
      f1.at = Date.now();
      f1.err = null;
    } catch (e) { f1.err = e || new Error('Fehler'); }
    finally { f1.busy = null; f1.tried = Date.now(); renderF1(); f1Plan(); }
  })();
  return f1.busy;
}
function f1Plan() {
  clearTimeout(f1.timer);
  const now = Date.now(), r = f1Next(now);
  // Am Rennwochenende öfter nachsehen, damit Ergebnisse schnell auftauchen
  const weekend = r && f1Sessions(r).some(s => now > s.at.getTime() - 36e5 && now < s.at.getTime() + 4 * 36e5);
  f1.timer = setTimeout(() => {
    if (!views.has('f1')) return;
    if (document.visibilityState === 'visible') f1Load(); else f1Plan();
  }, f1.err ? 3 * 6e4 : weekend ? 10 * 6e4 : 30 * 6e4);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && views.has('f1') && f1.tried && Date.now() - f1.tried > 10 * 6e4) f1Load(); });

function f1NextHtml(now) {
  const r = f1Next(now);
  if (!r) return `<div class="f1-race"><div><b>Saison ${esc(f1.season)} ist vorbei</b><small>Der neue Kalender kommt, sobald er feststeht.</small></div></div>`;
  const ss = f1Sessions(r), loc = r.Circuit.Location;
  const live = ss.find(s => now >= s.at.getTime() && now < s.at.getTime() + s.min * 6e4);
  const nx = ss.find(s => s.at.getTime() > now);
  const raceAt = f1When(r);
  let cd;
  if (live) cd = `<span class="live">${esc(live.name)} läuft</span>`;
  else if (nx && nx.at - now < 6 * DAY) cd = `${esc(nx.name)} in ${esc(dur(nx.at - now, true))}`;
  else cd = `in ${esc(dur(raceAt - now, true))}`;
  const items = ss.map(s => {
    const done = now >= s.at.getTime() + s.min * 6e4, isLive = s === live, isNext = !live && s === nx;
    return `<li class="${done ? 'done' : ''}${isNext ? ' next' : ''}${s.race ? ' race' : ''}"><b>${esc(s.name)}${isLive ? ' <span class="live">Live</span>' : ''}</b><span>${WD[s.at.getDay()]} ${dm(s.at)} ${hm(s.at)}</span></li>`;
  }).join('');
  return `<div class="f1-race"><div><b>${esc(r.raceName)}</b><small>${esc(r.Circuit.circuitName)}, ${esc(COUNTRY_DE[loc.country] || loc.country)}</small></div><span class="f1-cd">${cd}</span></div><ul class="f1-sess">${items}</ul>`;
}
function f1DriversHtml(fav) {
  if (!f1.drivers.length) return '<p class="empty">Noch keine Punkte in dieser Saison.</p>';
  const list = f1.all ? f1.drivers : f1.drivers.slice(0, 10);
  const rows = list.map(x => {
    const d = x.Driver, t = x.Constructors[x.Constructors.length - 1] || {};
    return `<li><button type="button" class="st-row${d.driverId === fav ? ' fav' : ''}" data-f1d="${esc(d.driverId)}"><span class="st-pos">${esc(x.positionText)}</span><span class="st-name"><i class="tm" style="--c:${F1_COLOR[t.constructorId] || 'var(--muted)'}"></i><span><b>${esc(f1Name(d))}</b><small>${esc(t.name || '')}</small></span></span><span class="st-pts">${esc(x.points)}<small>${+x.wins ? `${x.wins} ${+x.wins === 1 ? 'Sieg' : 'Siege'}` : 'Punkte'}</small></span></button></li>`;
  }).join('');
  const more = f1.drivers.length > 10 ? `<button type="button" class="more" data-f1all>${f1.all ? 'Weniger anzeigen' : `Alle ${f1.drivers.length} Fahrer`}</button>` : '';
  return `<ul class="st-list">${rows}</ul>${more}`;
}
function f1TeamsHtml() {
  if (!f1.teams.length) return '<p class="empty">Noch keine Punkte in dieser Saison.</p>';
  return `<ul class="st-list">${f1.teams.map(x => {
    const c = x.Constructor, drv = f1.drivers.filter(d => (d.Constructors[d.Constructors.length - 1] || {}).constructorId === c.constructorId).map(d => d.Driver.familyName);
    return `<li><button type="button" class="st-row" data-f1t="${esc(c.constructorId)}"><span class="st-pos">${esc(x.positionText)}</span><span class="st-name"><i class="tm" style="--c:${F1_COLOR[c.constructorId] || 'var(--muted)'}"></i><span><b>${esc(c.name)}</b><small>${esc(drv.join(', '))}</small></span></span><span class="st-pts">${esc(x.points)}<small>${+x.wins ? `${x.wins} ${+x.wins === 1 ? 'Sieg' : 'Siege'}` : 'Punkte'}</small></span></button></li>`;
  }).join('')}</ul>`;
}
function f1LastHtml(fav) {
  const r = f1.last;
  if (!r) return '<p class="empty">In dieser Saison gab es noch kein Rennen.</p>';
  const d = f1When(r);
  const rows = r.Results.slice(0, f1.all ? 30 : 10).map(x => {
    const dr = x.Driver, t = x.Constructor, fl = x.FastestLap && x.FastestLap.rank === '1';
    const time = x.Time ? x.Time.time : x.status === 'Finished' ? '' : x.status === 'Retired' ? 'Ausfall' : x.status;
    return `<li><button type="button" class="st-row${dr.driverId === fav ? ' fav' : ''}" data-f1d="${esc(dr.driverId)}"><span class="st-pos">${esc(x.positionText)}</span><span class="st-name"><i class="tm" style="--c:${F1_COLOR[t.constructorId] || 'var(--muted)'}"></i><span><b>${esc(f1Name(dr))}</b><small>${esc(t.name)}${fl ? ' · schnellste Runde' : ''}</small></span></span><span class="st-pts">${esc(time)}<small>${+x.points ? `${esc(x.points)} Pkt` : ''}</small></span></button></li>`;
  }).join('');
  const more = r.Results.length > 10 ? `<button type="button" class="more" data-f1all>${f1.all ? 'Weniger anzeigen' : `Alle ${r.Results.length} zeigen`}</button>` : '';
  return `<p class="sub-h">${esc(r.raceName)} · ${WD[d.getDay()]} ${dm(d)}</p><ul class="st-list">${rows}</ul>${more}`;
}
function renderF1() {
  const v = views.get('f1');
  if (!v) return;
  const now = Date.now(), fav = state.widgets.f1.cfg.fav;
  if (!f1.races && !f1.busy && (!f1.tried || now - f1.tried > 6e4)) f1Load();
  const ready = !!f1.races;
  $('#f1-off').hidden = ready;
  $('#f1-live').hidden = !ready;
  if (!ready) {
    const bad = f1.err && !f1.busy;
    $('#f1-off').classList.toggle('is-loading', !bad);
    $('#f1-off-t').textContent = bad ? 'Formel-1-Daten gerade nicht erreichbar' : 'Formel 1 wird geladen';
    $('#f1-off-p').textContent = bad ? 'Jolpica antwortet gerade nicht. In ein paar Minuten gibt es automatisch einen neuen Versuch.' : 'Einen Moment, Kalender und WM-Stand kommen gleich.';
    $('#f1-retry').hidden = !bad;
    $('#f1-src').textContent = '';
    return;
  }
  const r = f1Next(now);
  $('#f1-round').textContent = r ? `Runde ${r.round} von ${f1.races.length}` : `Saison ${f1.season}`;
  $('#f1-next').innerHTML = f1NextHtml(now);
  segSet($('#f1-tabs'), f1.tab);
  $('#f1-body').innerHTML = f1.tab === 'teams' ? f1TeamsHtml() : f1.tab === 'last' ? f1LastHtml(fav) : f1DriversHtml(fav);
  $('#f1-src').textContent = `Stand ${hm(new Date(f1.tried || f1.at))} Uhr${f1.err ? ', Aktualisieren hat gerade nicht geklappt' : ''}${f1.round ? ` · WM-Stand nach Runde ${f1.round}` : ''} · Daten: Jolpica`;
  f1.minute = Math.floor(now / 6e4);
}
/* Countdown und Sessions jede Minute auffrischen */
function f1Tick(now) {
  const v = views.get('f1'), mk = Math.floor(now.getTime() / 6e4);
  if (!v || v.el.hidden || !f1.races || mk === f1.minute) return;
  f1.minute = mk;
  $('#f1-next').innerHTML = f1NextHtml(now.getTime());
}

/* Infofenster: Fahrer */
async function f1DriverInfo(id) {
  const st = f1.drivers.find(x => x.Driver.driverId === id);
  const res0 = f1.last && f1.last.Results.find(x => x.Driver.driverId === id);
  const d = st ? st.Driver : res0 ? res0.Driver : null;
  if (!d) return;
  const t = st ? st.Constructors[st.Constructors.length - 1] : res0.Constructor;
  const key = `f1d:${id}`, name = f1Name(d);
  const born = validYmd(d.dateOfBirth) ? parseYmd(d.dateOfBirth) : null;
  const age = born ? Math.floor((Date.now() - born) / (365.2425 * DAY)) : null;
  const stat = (l, x) => `<div><span>${l}</span><b>${x}</b></div>`;
  const html = `<div class="in-head"><span class="tm" style="--c:${F1_COLOR[t.constructorId] || 'var(--muted)'};height:56px;width:6px"></span><div><b>${esc(name)}${d.permanentNumber ? ` <span style="color:var(--muted);font-weight:600">#${esc(d.permanentNumber)}</span>` : ''}</b><small>${esc(t.name)} · ${esc(NAT_DE[d.nationality] || d.nationality)}${age ? ` · ${age} Jahre` : ''}</small></div></div>`
    + (st ? `<div class="in-stats">${stat('WM-Platz', esc(st.positionText))}${stat('Punkte', esc(st.points))}${stat('Siege', esc(st.wins))}<div data-r="podium"><span>Podien</span><b>…</b></div></div>` : '')
    + '<div class="in-sec"><h3>Rennen dieser Saison</h3><div data-r="res"><p class="hint">Ergebnisse werden geladen …</p></div></div>'
    + '<div class="in-sec in-wiki" data-r="wiki"></div>';
  const enTitle = decodeURIComponent(String(d.url || '').split('/wiki/')[1] || '').replace(/_/g, ' ');
  openInfo(key, name, html, wikiSummary([name]).then(r => r || wikiSummary([enTitle], 'en')));
  try {
    const j = await getJson(`${JOL}/current/drivers/${encodeURIComponent(id)}/results.json?limit=100`, 15000);
    const races = j.MRData.RaceTable.Races || [];
    const pod = races.filter(r => +r.Results[0].position <= 3).length;
    fillInfo(key, '[data-r="podium"]', `<span>Podien</span><b>${pod}</b>`);
    fillInfo(key, '[data-r="res"]', races.length ? `<ul class="in-res">${races.slice().reverse().map(r => {
      const x = r.Results[0], ok = /^(Finished|\+\d+ Laps?)$/.test(x.status);
      return `<li><span>${esc(f1Short(r.raceName))}</span><span class="d">Start ${esc(x.grid === '0' ? 'Box' : x.grid)}${ok ? '' : ` · ${x.status === 'Retired' ? 'Ausfall' : esc(x.status)}`}</span><span class="s">P${esc(x.positionText)}${+x.points ? ` · ${esc(x.points)}` : ''}</span></li>`;
    }).join('')}</ul>` : '<p class="empty">Noch keine Rennen gefahren.</p>');
  } catch { fillInfo(key, '[data-r="res"]', '<p class="hint">Die Ergebnisse sind gerade nicht erreichbar.</p>'); }
}
/* Infofenster: Team */
async function f1TeamInfo(id) {
  const st = f1.teams.find(x => x.Constructor.constructorId === id);
  if (!st) return;
  const c = st.Constructor, key = `f1t:${id}`;
  const drv = f1.drivers.filter(d => (d.Constructors[d.Constructors.length - 1] || {}).constructorId === id);
  const stat = (l, x) => `<div><span>${l}</span><b>${x}</b></div>`;
  const html = `<div class="in-head"><span class="tm" style="--c:${F1_COLOR[id] || 'var(--muted)'};height:56px;width:6px"></span><div><b>${esc(c.name)}</b><small>Konstrukteurs-WM ${esc(f1.season)} · ${esc(NAT_DE[c.nationality] || c.nationality)}</small></div></div>`
    + `<div class="in-stats">${stat('WM-Platz', esc(st.positionText))}${stat('Punkte', esc(st.points))}${stat('Siege', esc(st.wins))}</div>`
    + (drv.length ? `<div class="in-sec"><h3>Fahrer</h3><ul class="in-res">${drv.map(d => `<li><button type="button" data-f1d="${esc(d.Driver.driverId)}"><span>${esc(f1Name(d.Driver))}</span></button><span class="d">WM-Platz ${esc(d.positionText)}</span><span class="s">${esc(d.points)}</span></li>`).join('')}</ul></div>` : '')
    + '<div class="in-sec"><h3>Punkte pro Rennen</h3><div data-r="res"><p class="hint">Ergebnisse werden geladen …</p></div></div>'
    + '<div class="in-sec in-wiki" data-r="wiki"></div>';
  const enTitle = decodeURIComponent(String(c.url || '').split('/wiki/')[1] || '').replace(/_/g, ' ');
  openInfo(key, c.name, html, wikiSearch(`${c.name} Formel-1-Team`).then(tt => tt ? wikiSummary([tt]) : null).then(r => r || wikiSummary([enTitle], 'en')));
  try {
    const j = await getJson(`${JOL}/current/constructors/${encodeURIComponent(id)}/results.json?limit=100`, 15000);
    const races = j.MRData.RaceTable.Races || [];
    fillInfo(key, '[data-r="res"]', races.length ? `<ul class="in-res">${races.slice().reverse().map(r => {
      const pts = r.Results.reduce((s, x) => s + (+x.points || 0), 0), best = Math.min(...r.Results.map(x => +x.position || 99));
      return `<li><span>${esc(f1Short(r.raceName))}</span><span class="d">bester P${best}</span><span class="s">${pts}</span></li>`;
    }).join('')}</ul>` : '<p class="empty">Noch keine Rennen gefahren.</p>');
  } catch { fillInfo(key, '[data-r="res"]', '<p class="hint">Die Ergebnisse sind gerade nicht erreichbar.</p>'); }
}
$('#f1').addEventListener('click', e => {
  const d = e.target.closest('[data-f1d]'), t = e.target.closest('[data-f1t]');
  if (d) return f1DriverInfo(d.dataset.f1d);
  if (t) return f1TeamInfo(t.dataset.f1t);
  const tab = e.target.closest('#f1-tabs [data-v]');
  if (tab) { f1.tab = tab.dataset.v; f1.all = false; renderF1(); return; }
  if (e.target.closest('[data-f1all]')) { f1.all = !f1.all; renderF1(); }
});
$('#f1-retry').addEventListener('click', () => f1Load(true));
$('#info-body').addEventListener('click', e => { const d = e.target.closest('[data-f1d]'); if (d) f1DriverInfo(d.dataset.f1d); });

defineWidget('f1', {
  render: renderF1,
  settings: {
    render(box, w) {
      const opts = f1.drivers.map(x => `<option value="${esc(x.Driver.driverId)}"${x.Driver.driverId === w.cfg.fav ? ' selected' : ''}>${esc(f1Name(x.Driver))}</option>`).join('');
      box.innerHTML = `<label class="field"><span class="lbl">Lieblingsfahrer (wird hervorgehoben)</span><select data-s="fav"><option value="">Keiner</option>${opts}</select></label>`;
    },
    save(box, w) { w.cfg.fav = box.querySelector('[data-s="fav"]').value; return null; }
  }
});
