/* Geburtstage (gibt es nur einmal). Die Liste steht in state.bdays und damit auch in der Sicherung.
 * Quellen: selbst eingetragen, aus einer vCard-Datei der Kontakte übernommen (iPhone, Mac, icloud.com)
 * und ganztägige Termine aus dem Kalender-Widget, die „Geburtstag“ im Titel haben.
 * Wer am 29. Februar Geburtstag hat, feiert in Jahren ohne Schalttag am 28. */
const bd = { more: false, filter: '' };
const bdCfg = () => state.widgets.bday.cfg;
const bdDate = (b, y) => (b.m === 2 && b.d === 29 && !leapYear(y) ? new Date(y, 1, 28) : new Date(y, b.m - 1, b.d));
function bdNext(b, today) {
  const d = bdDate(b, today.getFullYear());
  return d < today ? bdDate(b, today.getFullYear() + 1) : d;
}
const BD_CAL = /geburtstag|birthday|bday|🎂/i;
/* Alle kommenden Geburtstage, eigene und aus dem Kalender, nach Datum sortiert */
function bdUpcoming(now) {
  const today = sod(now), out = [];
  for (const b of state.bdays.list) {
    const d = bdNext(b, today);
    out.push({ id: b.id, name: b.name, d, age: b.y ? d.getFullYear() - b.y : null, cal: false });
  }
  if (bdCfg().cal && ca.data && caSec().feeds.length) {
    const seen = new Set();
    for (const e of ca.data.events) {
      if (!e.a || !BD_CAL.test(e.t)) continue;
      const d = sod(new Date(e.s));
      if (d < today || seen.has(e.t + +d)) continue;
      seen.add(e.t + +d);
      // Steht dieselbe Person schon in der eigenen Liste, reicht der eigene Eintrag
      const low = e.t.toLowerCase();
      if (out.some(x => !x.cal && +x.d === +d && low.includes(x.name.toLowerCase().split(/\s+/)[0]))) continue;
      out.push({ id: e.id, name: e.t, d, age: null, cal: true, color: caFeedColor(e.f) });
    }
  }
  return out.sort((a, b) => a.d - b.d || a.name.localeCompare(b.name, 'de'));
}
const bdWhen = n => (n === 0 ? 'Heute' : n === 1 ? 'Morgen' : `in ${n} Tagen`);
function renderBday() {
  const list = state.bdays.list, c = bdCfg(), now = new Date(), today = sod(now);
  const formOpen = !$('#bd-form').hidden;
  const all = bdUpcoming(now);
  $('#bd-setup').hidden = formOpen || all.length > 0;
  $('#bd-live').hidden = formOpen || !all.length;
  $('#bd-src').textContent = list.length ? `${list.length} ${list.length === 1 ? 'Geburtstag' : 'Geburtstage'} gespeichert${c.cal && caSec().feeds.length ? ', dazu die aus deinem Kalender' : ''}.` : '';
  if (formOpen) { bdRenderAll(); return; }
  if (!all.length) return;
  const base = isNarrow() ? Math.min(c.n, 4) : c.n, n = bd.more ? Math.min(all.length, 40) : base;
  $('#bd-list').innerHTML = all.slice(0, n).map(x => {
    const dd = dayDiff(today, x.d), soon = dd <= 1;
    const sub = [`${WD[x.d.getDay()]} ${x.d.getDate()}. ${MS[x.d.getMonth()]}`, x.age != null ? (dd === 0 ? `wird heute ${x.age}` : `wird ${x.age}`) : '', x.cal ? 'aus dem Kalender' : ''].filter(Boolean).join(' · ');
    return `<li class="bd-row${dd === 0 ? ' today' : ''}"${x.cal ? ` style="--c:${x.color}"` : ''}><span class="bd-cal" aria-hidden="true"><b>${x.d.getDate()}</b><small>${MS[x.d.getMonth()]}</small></span><span class="bd-main"><b>${esc(x.name)}</b><small>${esc(sub)}</small></span><span class="bd-in${soon ? ' soon' : ''}">${bdWhen(dd)}</span></li>`;
  }).join('');
  $('#bd-more').hidden = all.length <= base;
  $('#bd-more').textContent = bd.more ? 'Weniger zeigen' : `Mehr zeigen`;
}
/* Für den Spiegel: Geburtstage heute und morgen */
function bdMirror(now) {
  const today = sod(now);
  return bdUpcoming(now).filter(x => dayDiff(today, x.d) <= 1).slice(0, 4).map(x => {
    const dd = dayDiff(today, x.d);
    return `${dd ? 'Morgen' : 'Heute'}: ${x.name}${x.age != null ? ` wird ${x.age}` : x.cal ? '' : ' hat Geburtstag'}`;
  });
}

/* Verwalten: alle Einträge alphabetisch, mit Suche, Löschen mit Rückgängig */
function bdRenderAll() {
  const list = state.bdays.list, q = bd.filter.trim().toLowerCase();
  $('#bd-filter-box').hidden = list.length < 8;
  $('#bd-filter').placeholder = `In ${list.length} Geburtstagen suchen`;
  $('#bd-clear').hidden = !list.length;
  const hits = list.filter(b => !q || b.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const show = hits.slice(0, 150);
  $('#bd-all').innerHTML = show.map(b => `<li><span class="tx"><b>${esc(b.name)}</b><span>${pad(b.d)}.${pad(b.m)}.${b.y || ''}</span></span><button type="button" class="icon-btn" data-bddel="${b.id}" aria-label="${esc(b.name)} löschen">${TRASH}</button></li>`).join('')
    + (hits.length > show.length ? `<li class="empty">Noch ${hits.length - show.length} weitere. Such nach dem Namen.</li>` : '')
    + (!hits.length && list.length ? '<li class="empty">Niemand gefunden.</li>' : '');
  $('#bd-all').hidden = !list.length;
}
function bdOpenForm() {
  const c = bdCfg();
  $('#bd-n').value = String(c.n);
  $('#bd-cal').checked = c.cal;
  $('#bd-name').value = '';
  $('#bd-date').value = '';
  $('#bd-ferr').hidden = true;
  $('#bd-import-msg').hidden = true;
  bd.filter = '';
  $('#bd-filter').value = '';
  $('#bd-form').hidden = false;
  renderBday();
  layoutNow();
  $('#bd-name').focus();
}
/* „15.3.“, „15.03.1990“, „15.3.90“ */
function bdParseInput(s) {
  const m = /^(\d{1,2})\.\s*(\d{1,2})\.?\s*(\d{2}|\d{4})?$/.exec(String(s).trim());
  if (!m) return null;
  const d = +m[1], mo = +m[2];
  let y = m[3] ? +m[3] : null;
  if (y != null && y < 100) y += y > new Date().getFullYear() % 100 ? 1900 : 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1]) return null;
  if (y != null && (y < 1880 || y > new Date().getFullYear() || (mo === 2 && d === 29 && !leapYear(y)))) return null;
  return { m: mo, d, y };
}
function bdAdd() {
  const fail = m => { $('#bd-ferr').textContent = m; $('#bd-ferr').hidden = false; return false; };
  const name = $('#bd-name').value.trim().slice(0, 60), raw = $('#bd-date').value.trim();
  if (!name && !raw) return true;
  if (!name) return fail('Wer hat Geburtstag? Trag einen Namen ein.');
  const p = bdParseInput(raw);
  if (!p) return fail('Das Datum bitte als TT.MM. oder TT.MM.JJJJ, zum Beispiel 15.03. oder 15.03.1990.');
  if (state.bdays.list.length >= 600) return fail('Mehr als 600 Geburtstage gehen nicht.');
  const old = state.bdays.list.find(b => b.name.toLowerCase() === name.toLowerCase());
  if (old) Object.assign(old, p);
  else state.bdays.list.push({ id: uid(), name, ...p });
  $('#bd-ferr').hidden = true;
  $('#bd-name').value = '';
  $('#bd-date').value = '';
  commit();
  toast(old ? `Geburtstag von ${name} geändert` : `${name} ist eingetragen`);
  return true;
}

/* vCard lesen: Zeilenumbrüche nach RFC 6350 zusammenfügen, Name aus FN (sonst N), Geburtstag aus BDAY.
 * Apple speichert Geburtstage ohne Jahr als 1604 oder mit X-APPLE-OMIT-YEAR. */
function vcUnesc(s) { return String(s).replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim(); }
function vcQp(s, charset) {
  const bytes = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '=' && /^[0-9A-F]{2}$/i.test(s.slice(i + 1, i + 3))) { bytes.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2; }
    else bytes.push(s.charCodeAt(i) & 255);
  }
  try { return new TextDecoder(/8859|latin|1252/i.test(charset) ? 'windows-1252' : 'utf-8').decode(new Uint8Array(bytes)); } catch { return s; }
}
function vcDate(v, params) {
  v = String(v).trim();
  let y = null, m, d, r;
  if ((r = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(v))) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = /^--(\d{2})-?(\d{2})/.exec(v))) { m = +r[1]; d = +r[2]; }
  else return null;
  if (/X-APPLE-OMIT-YEAR/i.test(params) || (y != null && y <= 1604)) y = null;
  if (m < 1 || m > 12 || d < 1 || d > [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]) return null;
  return { m, d, y };
}
function parseVcf(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const cards = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (/^BEGIN:VCARD/i.test(line)) { cur = { fn: '', n: '', bday: null }; continue; }
    if (/^END:VCARD/i.test(line)) { if (cur) cards.push(cur); cur = null; continue; }
    if (!cur) continue;
    const m = /^(?:[\w-]+\.)?([A-Za-z-]+)((?:;[^:]*)?):(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toUpperCase(), params = m[2];
    if (key !== 'FN' && key !== 'N' && key !== 'BDAY') continue;
    let val = m[3];
    if (/QUOTED-PRINTABLE/i.test(params)) {
      // Alte vCards (2.1) brechen lange Zeilen mit = am Ende um
      while (val.endsWith('=') && i + 1 < lines.length) val = val.slice(0, -1) + lines[++i];
      const cs = /CHARSET=([\w-]+)/i.exec(params);
      val = vcQp(val, cs ? cs[1] : 'utf-8');
    }
    if (key === 'FN') cur.fn = vcUnesc(val);
    else if (key === 'N') { const p = val.split(';').map(vcUnesc); cur.n = [p[3], p[1], p[2], p[0], p[4]].filter(Boolean).join(' '); }
    else cur.bday = vcDate(val, params);
  }
  return cards.map(c => ({ name: (c.fn || c.n).replace(/\s+/g, ' ').trim().slice(0, 60), bday: c.bday })).filter(c => c.name);
}
function bdImport(text) {
  const cards = parseVcf(text);
  if (!cards.length) return { err: 'In der Datei stehen keine Kontakte. Nimm eine vCard-Datei (.vcf).' };
  let added = 0, changed = 0, same = 0;
  const list = state.bdays.list, without = cards.filter(c => !c.bday).length;
  for (const c of cards) {
    if (!c.bday) continue;
    const old = list.find(b => b.name.toLowerCase() === c.name.toLowerCase());
    if (old) {
      if (old.m === c.bday.m && old.d === c.bday.d && (old.y === c.bday.y || !c.bday.y)) { same++; continue; }
      Object.assign(old, { m: c.bday.m, d: c.bday.d, y: c.bday.y || old.y });
      changed++;
    } else if (list.length < 600) { list.push({ id: uid(), name: c.name, ...c.bday }); added++; }
  }
  return { added, changed, same, without };
}
$('#bd-setup-btn').addEventListener('click', bdOpenForm);
$('#bd-set-btn').addEventListener('click', () => { if ($('#bd-form').hidden) bdOpenForm(); else { $('#bd-form').hidden = true; renderBday(); layoutNow(); } });
$('#bd-add').addEventListener('click', () => { if (bdAdd()) $('#bd-name').focus(); });
for (const id of ['#bd-name', '#bd-date']) $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (bdAdd()) $('#bd-name').focus(); } });
$('#bd-filter').addEventListener('input', e => { bd.filter = e.target.value; bdRenderAll(); });
$('#bd-all').addEventListener('click', e => {
  const b = e.target.closest('[data-bddel]');
  if (!b) return;
  const list = state.bdays.list, i = list.findIndex(x => x.id === b.dataset.bddel);
  if (i < 0) return;
  const [gone] = list.splice(i, 1);
  commit();
  toast(`${gone.name} gelöscht`, () => { if (!state.bdays.list.some(x => x.id === gone.id)) { state.bdays.list.push(gone); commit(); } });
});
$('#bd-clear').addEventListener('click', () => {
  const old = state.bdays.list.slice();
  state.bdays.list = [];
  commit();
  toast(`Alle ${old.length} Geburtstage gelöscht`, () => { state.bdays.list = old; commit(); }, { ms: 12000 });
});
$('#bd-import').addEventListener('click', () => { $('#bd-file').value = ''; $('#bd-file').click(); });
$('#bd-file').addEventListener('change', async e => {
  const f = e.target.files && e.target.files[0], msg = $('#bd-import-msg');
  if (!f) return;
  msg.hidden = false;
  if (f.size > 60e6) { msg.textContent = 'Die Datei ist zu groß.'; return; }
  let r;
  try { r = bdImport(await f.text()); } catch { r = { err: 'Die Datei konnte nicht gelesen werden.' }; }
  if (r.err) { msg.textContent = r.err; return; }
  const parts = [];
  if (r.added) parts.push(`${r.added} neu`);
  if (r.changed) parts.push(`${r.changed} geändert`);
  if (r.same) parts.push(`${r.same} schon da`);
  msg.textContent = (r.added + r.changed + r.same ? `Geburtstage übernommen: ${parts.join(', ')}.` : 'In der Datei steht bei keinem Kontakt ein Geburtstag.')
    + (r.without ? ` ${r.without} ${r.without === 1 ? 'Kontakt hat' : 'Kontakte haben'} keinen Geburtstag eingetragen.` : '');
  if (r.added || r.changed) commit(); else bdRenderAll();
});
$('#bd-form').addEventListener('submit', e => {
  e.preventDefault();
  if (($('#bd-name').value.trim() || $('#bd-date').value.trim()) && !bdAdd()) return;
  const c = bdCfg();
  c.n = +$('#bd-n').value || 6;
  c.cal = $('#bd-cal').checked;
  $('#bd-form').hidden = true;
  commit();
  layoutNow();
});
$('#bd-more').addEventListener('click', () => { bd.more = !bd.more; renderBday(); layoutNow(); });
/* Um Mitternacht springen die Countdowns weiter */
let bdDayKey = '';
function bdTick(now) {
  const k = ymd(now);
  if (k === bdDayKey) return;
  bdDayKey = k;
  if (views.has('bday')) renderBday();
}

defineWidget('bday', { render: renderBday });
