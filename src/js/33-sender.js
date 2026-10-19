/* Sender für Fußball und Formel 1: wo ein Spiel oder eine Session läuft.
 * Eine freie Schnittstelle dafür gibt es nicht, deshalb steht hier eine gepflegte Liste (Stand TV_STAND):
 * Regeln pro Liga nach Anstoßzeit und pro Rennwochenende, wer in Österreich und der Schweiz frei überträgt.
 * Was du selbst änderst, liegt getrennt in state.tv.ov (Schlüssel fb:Liga:Spiel-ID oder f1:Saison:Strecke)
 * und übersteht jedes Update dieser Liste. Gratis heißt frei empfangbar im Heimatland des Senders.
 * ORF, ServusTV und SRF sperren Zugriffe von außerhalb, aus Deutschland geht das nur mit VPN.
 *
 * Neue F1-Saison eintragen: in F1_TV ein Jahr mit base (wer grundsätzlich welche Sessions zeigt) und races
 * (pro circuitId von Jolpica: at = wer in Österreich live zeigt, ORF oder ServusTV, rtl = RTL zeigt Qualifying und Rennen frei).
 * Danach TV_STAND hochsetzen. Fehlt eine Saison, sagt die Karte das, statt etwas Falsches zu zeigen. */
const TV_STAND = '2026-10-19';
const TV = {
  sky: { name: 'Sky', full: 'Sky und WOW' },
  dazn: { name: 'DAZN' },
  magenta: { name: 'MagentaSport' },
  rtl: { name: 'RTL', free: true, url: 'https://plus.rtl.de/', via: 'RTL+' },
  sat1: { name: 'Sat.1', free: true, url: 'https://www.joyn.de/play/live-tv', via: 'Joyn' },
  ard: { name: 'ARD', full: 'ARD und die Dritten', free: true, url: 'https://www.ardmediathek.de/live', via: 'ARD Mediathek' },
  orf: { name: 'ORF', free: true, vpn: 'Österreich', url: 'https://on.orf.at/livestreams', via: 'ORF ON' },
  servus: { name: 'ServusTV', free: true, vpn: 'Österreich', url: 'https://www.servustv.com/de/sport', via: 'ServusTV On' },
  srf: { name: 'SRF', free: true, vpn: 'Schweiz', url: 'https://www.srf.ch/play/tv/live', via: 'Play SRF' }
};
/* Formel 1. Sky zeigt in Deutschland alles, SRF Sprint und Qualifying samt Rennen (keine Trainings).
 * In Österreich wechseln sich ORF und ServusTV ab, wer dran ist, zeigt alle Sessions. RTL hat 2026 fünf Rennen frei,
 * offen ist davon nur noch Las Vegas. Die Rennen vor dem Stand fehlen hier, die zeigt die Karte nicht mehr an. */
const F1_TV = {
  2026: {
    base: { sky: 'all', srf: ['sq', 'sprint', 'quali', 'race'] },
    races: {
      americas: { at: 'servus' },
      rodriguez: { at: 'orf' },
      interlagos: { at: 'servus' },
      vegas: { at: 'orf', rtl: true },
      losail: { at: 'servus' },
      yas_marina: { at: 'orf' }
    }
  }
};
/* Fußball nach Anstoßzeit in deutscher Zeit. conf: wer die Konferenz zeigt, wenn mehrere Spiele gleichzeitig anfangen.
 * 1. Liga: Sky hat Freitag, Samstag und die englischen Wochen, DAZN den Sonntag und die Samstagskonferenz.
 * 2. Liga: Sky hat alles, das Topspiel am Samstagabend läuft meistens zusätzlich bei RTL.
 * 3. Liga: MagentaSport hat alles, rund zwei Spiele pro Wochenende zeigen die Dritten.
 * Free-TV-Spiele, die kurzfristig festgelegt werden (RTL und Sat.1 in der 1. Liga, die Dritten in der 3. Liga), trägst du per Tipp auf die Anstoßzeit ein. */
const FB_TV = {
  bl1: { ch: ['sky', 'dazn', 'rtl', 'sat1'], conf: 'dazn', rule: t => (t.wd === 0 ? ['dazn'] : ['sky']) },
  bl2: { ch: ['sky', 'rtl', 'sat1'], conf: 'sky', rule: t => (t.wd === 6 && t.min >= 20 * 60 ? ['sky', 'rtl'] : ['sky']) },
  bl3: { ch: ['magenta', 'ard'], conf: 'magenta', rule: () => ['magenta'] }
};
const TV_ICO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6.5" width="18" height="12.5" rx="2.5"/><path d="M8.5 2.8l3.5 3.7 3.5-3.7"/></svg>';
const TV_OUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 16l8-8M9.5 8H16v6.5"/></svg>';

/* Anstoß in deutscher Zeit, auch wenn der Browser woanders steht: Wochentag (0 = Sonntag) und Minuten seit Mitternacht */
let tvFmt = null;
function deTime(ms) {
  const d = new Date(ms);
  try {
    tvFmt = tvFmt || new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const p = Object.fromEntries(tvFmt.formatToParts(d).map(x => [x.type, x.value]));
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
    if (wd >= 0) return { wd, min: (+p.hour % 24) * 60 + +p.minute };
  } catch { /* ohne Zeitzonen-Daten gilt die Zeit des Browsers */ }
  return { wd: d.getDay(), min: d.getHours() * 60 + d.getMinutes() };
}
const tvStand = () => { const d = parseYmd(TV_STAND); return `${dm(d)}${d.getFullYear()}`; };
/* Was ein Widget von einer Senderliste zeigt: nur eingeschaltete Sender, bei „Nur Free-TV“ nur freie, die freien zuerst */
const tvFreeFirst = l => [...l.filter(c => TV[c].free), ...l.filter(c => !TV[c].free)];
const tvShown = (list, t) => tvFreeFirst(list.filter(c => TV[c] && t.ch.includes(c) && (!t.free || TV[c].free)));
const tvNames = list => { const n = list.map(c => TV[c].name); return n.length > 1 ? `${n.slice(0, -1).join(', ')} und ${n[n.length - 1]}` : n[0] || ''; };
const tvTip = c => { const T = TV[c]; return T.free ? `${T.full || T.name}, gratis${T.vpn ? ` in ${T.vpn === 'Schweiz' ? 'der Schweiz' : T.vpn}, aus Deutschland mit VPN` : ''}` : `${T.full || T.name}, im Abo`; };
function tvChip(c, link) {
  const T = TV[c], cls = `tv${T.free ? ' free' : ''}`;
  if (link && T.free && T.url) return `<a class="${cls}" href="${T.url}" target="_blank" rel="noopener" title="Zum Livestream bei ${esc(T.via)}">${esc(T.name)}${TV_OUT}</a>`;
  return `<span class="${cls}" title="${esc(tvTip(c))}">${esc(T.name)}</span>`;
}
const tvMini = list => (list.length ? `<span class="tv-mini">${list.map(c => `<i class="tv${TV[c].free ? ' free' : ''}" title="${esc(tvTip(c))}">${esc(TV[c].name)}</i>`).join('')}</span>` : '');
/* VPN: Schweiz für SRF, Österreich für ServusTV */
function tvVpn(list) {
  const by = new Map();
  for (const c of list) if (TV[c].vpn) by.set(TV[c].vpn, [...(by.get(TV[c].vpn) || []), TV[c].name]);
  return by.size ? `<p class="tv-vpn">VPN: ${esc([...by].map(([land, n]) => `${land} für ${n.join(' und ')}`).join(', '))}</p>` : '';
}

/* Eigene Änderungen. Neue kommen ans Ende, damit beim Kappen die ältesten gehen. */
const tvOv = k => state.tv.ov[k] || null;
function tvPut(k, v) {
  delete state.tv.ov[k];
  if (v) state.tv.ov[k] = v;
  const ks = Object.keys(state.tv.ov);
  for (const x of ks.slice(0, Math.max(0, ks.length - TV_OV_MAX))) delete state.tv.ov[x];
}
const tvOwnCount = pre => Object.keys(state.tv.ov).filter(k => k.startsWith(pre)).length;

/* ---------- Formel 1 ---------- */
const f1TvKey = r => `f1:${r.season}:${r.Circuit.circuitId}`;
function f1TvBase(r, k) {
  const S = F1_TV[r.season];
  if (!S) return null;
  const R = S.races[r.Circuit.circuitId] || {}, on = new Set();
  for (const [c, ks] of Object.entries(S.base)) if (ks === 'all' || ks.includes(k)) on.add(c);
  if (R.at) on.add(R.at);
  if (R.rtl && (k === 'quali' || k === 'race')) on.add('rtl');
  return F1_TV_CH.filter(c => on.has(c));
}
function f1Tv(r, k) {
  const o = tvOv(f1TvKey(r));
  if (o && o[k]) return { ch: o[k], own: true };
  const b = f1TvBase(r, k);
  return { ch: b || [], own: false, unknown: !b };
}
/* Die Session für den Kasten: die laufende oder die nächste von denen, die du sehen willst */
function f1TvSession(r, now, t) {
  const ss = f1Sessions(r).filter(s => t.ses.includes(s.k));
  const live = ss.find(s => now >= +s.at && now < +s.at + s.min * 6e4);
  if (live) return { s: live, live: true };
  const nx = ss.find(s => +s.at > now);
  return nx ? { s: nx, live: false } : null;
}
function f1TvBox(r, now) {
  const t = state.widgets.f1.cfg.tv;
  if (!t.on) return '';
  const p = f1TvSession(r, now, t);
  if (!p) return '';
  const s = p.s, tv = f1Tv(r, s.k), shown = tvShown(tv.ch, t);
  const when = p.live ? '<span class="live">läuft</span>' : `<span>${WD[s.at.getDay()]} ${dm(s.at)} ${hm(s.at)}</span>`;
  let body;
  if (tv.unknown) body = `<p class="tv-note">Für ${esc(r.season)} ist noch nicht eingetragen, wer überträgt. Mit dem Stift trägst du es selbst ein.</p>`;
  else if (!shown.length) body = `<p class="tv-note">${tv.ch.length ? `Nur bei ${esc(tvNames(tv.ch))}` : 'Kein Sender eingetragen'}</p>`;
  else body = `<div class="tv-ch">${shown.map(c => tvChip(c, t.link)).join('')}</div>${t.vpn ? tvVpn(shown) : ''}`;
  return `<div class="tv-box"><div class="tv-h">${TV_ICO}<b>${esc(s.name)}</b>${when}${tv.own ? '<span class="chip">Eigene Auswahl</span>' : ''}<button type="button" class="icon-btn" data-tvedit aria-label="Sender für dieses Rennwochenende ändern" title="Sender ändern">${PENCIL}</button></div>${body}</div>`;
}
/* Kleine Sender an einer Session im Zeitplan */
function f1TvMini(r, s) {
  const t = state.widgets.f1.cfg.tv;
  return t.on && t.all && t.ses.includes(s.k) ? tvMini(tvShown(f1Tv(r, s.k).ch, t)) : '';
}
/* Für Spiegel und Jetzt: die Sender einer Session als Text, höchstens drei */
function f1TvText(r, s) {
  const t = state.widgets.f1.cfg.tv;
  return t.on && s && t.ses.includes(s.k) ? tvNames(tvShown(f1Tv(r, s.k).ch, t).slice(0, 3)) : '';
}
function f1TvEdit() {
  const r = f1.races ? f1Next(Date.now()) : null;
  if (!r) return;
  const ss = f1Sessions(r), o = tvOv(f1TvKey(r)) || {};
  const rows = [...new Set(ss.map(s => s.k))].map(k => {
    const list = ss.filter(s => s.k === k), base = f1TvBase(r, k) || [];
    const when = list.length > 1 ? [...new Set(list.map(s => WD[s.at.getDay()]))].join(', ') : `${WD[list[0].at.getDay()]} ${hm(list[0].at)}`;
    return { k, label: `${F1_TV_KINDS[k]} · ${when}`, chs: F1_TV_CH, base, cur: o[k] || base };
  });
  tvDialog({ sub: `${f1Short(r.raceName)}, ${dm(ss[0].at)} bis ${dm(f1When(r))}`, key: f1TvKey(r), f1: true, rows, note: 'Gilt nur für dieses Rennwochenende. Was du so lässt, wie es ist, folgt weiter der Liste.' });
}

/* ---------- Fußball ---------- */
const fbTvKey = (lg, m) => `fb:${lg}:${m.matchID}`;
const fbTvBase = (lg, m) => (FB_TV[lg] ? FB_TV[lg].rule(deTime(kick(m))) : []);
function fbTv(lg, m) {
  const o = tvOv(fbTvKey(lg, m));
  return o ? { ch: o, own: true } : { ch: fbTvBase(lg, m), own: false };
}
/* Fangen mehrere Spiele einer Liga gleichzeitig an, gibt es sie zusammen in der Konferenz */
function fbConf(lg, D, m) {
  const L = FB_TV[lg], k = kick(m);
  return L && L.conf && (D.matches || []).filter(x => kick(x) === k).length >= 2 ? L.conf : null;
}
const fbConfOn = (t, c) => !!c && t.on && t.conf && tvShown([c], t).length > 0;
/* Zeile unter dem nächsten Spiel deines Vereins */
function fbTvLine(c, lg, D, m, now) {
  const t = c.tv;
  if (!t.on || !m || m.matchIsFinished) return '';
  const tv = fbTv(lg, m), shown = tvShown(tv.ch, t), conf = fbConf(lg, D, m);
  const pen = `<button type="button" class="icon-btn" data-fbtv="${m.matchID}" data-lg="${lg}" aria-label="Sender für dieses Spiel ändern" title="Sender ändern">${PENCIL}</button>`;
  const confHtml = fbConfOn(t, conf) ? `<span class="tv-conf">auch in der Konferenz bei ${esc(TV[conf].name)}</span>` : '';
  if (!shown.length && !confHtml) return t.free || !tv.ch.length ? '' : `<div class="tv-line">${TV_ICO}<span class="tv-note">Nur bei ${esc(tvNames(tv.ch))}</span>${pen}</div>`;
  return `<div class="tv-line">${TV_ICO}${fbIsLive(m, now) ? '<span>Läuft bei</span>' : ''}${shown.map(c2 => tvChip(c2, t.link)).join('')}${confHtml}${tv.own ? '<span class="chip">Eigene Auswahl</span>' : ''}${pen}</div>`;
}
/* Anstoßzeit im Spieltag: antippen ändert die Sender, darunter die kleinen Sender */
function fbTvAt(c, lg, m) {
  const t = c.tv, d = new Date(kick(m));
  if (!t.on) return `<span class="fb-sc time">${hm(d)}</span>`;
  const tv = fbTv(lg, m);
  return `<button type="button" class="fb-sc time tv-at${tv.own ? ' own' : ''}" data-fbtv="${m.matchID}" data-lg="${lg}" title="Sender ändern"><span>${hm(d)}</span>${t.all ? tvMini(tvShown(tv.ch, t)) : ''}</button>`;
}
/* Konferenzen eines Tages für die Tageszeile im Spieltag */
function fbConfDay(c, lg, D, list) {
  const t = c.tv, out = [], seen = new Set();
  for (const m of list) {
    const k = kick(m);
    if (seen.has(k) || m.matchIsFinished) continue;
    seen.add(k);
    const conf = fbConf(lg, D, m);
    if (fbConfOn(t, conf)) out.push(`<span class="tv-conf">${hm(new Date(k))} Konferenz <i class="tv">${esc(TV[conf].name)}</i></span>`);
  }
  return out.join('');
}
/* Für Spiegel und Jetzt */
function fbTvText(c, lg, m) {
  const t = c.tv;
  return t.on && m && !m.matchIsFinished ? tvNames(tvShown(fbTv(lg, m).ch, t).slice(0, 2)) : '';
}
function fbTvEdit(lg, id) {
  const D = fbData(lg), m = (D.matches || []).find(x => x.matchID === id);
  if (!m || !FB_TV[lg]) return;
  const d = new Date(kick(m)), base = fbTvBase(lg, m), nm = x => x.shortName || x.teamName, conf = fbConf(lg, D, m);
  tvDialog({
    sub: `${nm(m.team1)} gegen ${nm(m.team2)}, ${WDL[d.getDay()]} ${dm(d)} ${hm(d)}`,
    key: fbTvKey(lg, m), f1: false,
    rows: [{ k: '', label: 'Läuft bei', chs: FB_TV[lg].ch, base, cur: tvOv(fbTvKey(lg, m)) || base }],
    note: conf ? `Die Konferenz bei ${TV[conf].name} bleibt, wie sie ist.` : ''
  });
}

/* ---------- Sender eines Spiels oder Rennens ändern ---------- */
const tvd = { key: '', f1: false, rows: [] };
const tvSame = (a, b) => a.length === b.length && a.every(x => b.includes(x));
function tvDialog(o) {
  tvd.key = o.key;
  tvd.f1 = o.f1;
  tvd.rows = o.rows;
  $('#tv-sub').textContent = o.sub;
  $('#tv-rows').innerHTML = o.rows.map((r, i) => `<div class="tv-row"><fieldset class="days"><legend class="lbl">${esc(r.label)}</legend>${r.chs.map(c => `<label title="${esc(tvTip(c))}"><input type="checkbox" data-row="${i}" value="${c}"${r.cur.includes(c) ? ' checked' : ''}><span>${esc(TV[c].name)}${TV[c].free ? ' <small>gratis</small>' : ''}</span></label>`).join('')}</fieldset>`
    + (tvSame(r.cur, r.base) ? '' : `<p class="hint">Laut Liste: ${esc(r.base.length ? tvNames(r.base) : 'kein Sender')}</p>`) + '</div>').join('');
  $('#tv-note').textContent = o.note || '';
  $('#tv-reset').hidden = !tvOv(o.key);
  $('#dlg-tv').showModal();
}
$('#tv-form').addEventListener('submit', e => {
  e.preventDefault();
  const sel = i => [...$('#tv-rows').querySelectorAll(`[data-row="${i}"]`)].filter(x => x.checked).map(x => x.value);
  if (tvd.f1) {
    const o = {};
    tvd.rows.forEach((r, i) => { const s = sel(i); if (!tvSame(s, r.base)) o[r.k] = s; });
    tvPut(tvd.key, Object.keys(o).length ? o : null);
  } else {
    const s = sel(0);
    tvPut(tvd.key, tvSame(s, tvd.rows[0].base) ? null : s);
  }
  $('#dlg-tv').close();
  commit();
});
$('#tv-reset').addEventListener('click', () => { tvPut(tvd.key, null); $('#dlg-tv').close(); commit(); });

/* ---------- Einstellungen im Widget ---------- */
/* o: ch (Sender zur Auswahl), show (davon sichtbar), kinds (Sessions wählbar), conf, vpn, allTxt, hint, pre (Präfix der eigenen Änderungen) */
function tvSetHtml(t, o) {
  const chip = (attr, k, name, on, hide) => `<label${hide ? ' hidden' : ''}><input type="checkbox" ${attr}="${k}"${on ? ' checked' : ''}><span>${esc(name)}</span></label>`;
  const sw = (k, on, txt) => `<label class="check-row"><input type="checkbox" class="switch" data-tv="${k}"${on ? ' checked' : ''}> ${txt}</label>`;
  const own = tvOwnCount(o.pre);
  return `<p class="set-h">Sender</p>${sw('on', t.on, 'Zeigen, wo es läuft')}<fieldset class="tv-set" data-tv="box"${t.on ? '' : ' disabled'}>`
    + `<fieldset class="days"><legend class="lbl">Diese Sender</legend>${o.ch.map(c => chip('data-tvch', c, TV[c].name, t.ch.includes(c), !o.show.includes(c))).join('')}</fieldset>`
    + (o.kinds ? `<fieldset class="days"><legend class="lbl">Bei diesen Sessions</legend>${Object.entries(F1_TV_KINDS).map(([k, n]) => chip('data-tvk', k, n, t.ses.includes(k))).join('')}</fieldset>` : '')
    + sw('free', t.free, 'Nur Free-TV')
    + (o.conf ? sw('conf', t.conf, 'Konferenzen zeigen') : '')
    + sw('all', t.all, o.allTxt)
    + (o.vpn ? sw('vpn', t.vpn, 'VPN-Hinweis bei ORF, ServusTV und SRF') : '')
    + sw('link', t.link, 'Free-TV-Sender verlinken den Livestream')
    + `<p class="hint">${o.hint}</p>`
    + (own ? `<button type="button" class="btn-ghost" data-tv="reset">Eigene Änderungen zurücksetzen (${own})</button>` : '')
    + '</fieldset>';
}
function tvSetWire(box, pre) {
  box._tvPre = pre;
  box._tvReset = false;
  box.querySelector('[data-tv="on"]').addEventListener('change', e => { box.querySelector('[data-tv="box"]').disabled = !e.target.checked; });
  const rs = box.querySelector('[data-tv="reset"]');
  if (rs) rs.addEventListener('click', () => { box._tvReset = true; rs.disabled = true; rs.textContent = 'Wird beim Speichern zurückgesetzt'; });
}
function tvSetSave(box, t) {
  const q = s => box.querySelector(s);
  t.on = q('[data-tv="on"]').checked;
  t.ch = [...box.querySelectorAll('[data-tvch]')].filter(x => x.checked).map(x => x.dataset.tvch);
  if (q('[data-tvk]')) t.ses = [...box.querySelectorAll('[data-tvk]')].filter(x => x.checked).map(x => x.dataset.tvk);
  for (const k of ['free', 'conf', 'all', 'vpn', 'link']) { const x = q(`[data-tv="${k}"]`); if (x) t[k] = x.checked; }
  if (box._tvReset) for (const k of Object.keys(state.tv.ov)) if (k.startsWith(box._tvPre)) delete state.tv.ov[k];
}
