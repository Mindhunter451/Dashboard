/* Bibelvers des Tages. Den Text liefert bolls.life (frei, ohne Key, CORS offen), die Liste der Verse steht hier.
 * Jeden Tag kommt der nächste Vers aus der Liste, auf allen Geräten derselbe. Mit „Noch einer“ blätterst du weiter.
 * Nur Stellen, die in allen angebotenen Übersetzungen gleich nummeriert sind (bei manchen Psalmen zählen
 * deutsche und englische Ausgaben die Überschrift mit, deshalb fehlen die hier). */
const VS_CACHE = 'jere-cockpit-vers';
const VS_BOOK = { 1: '1. Mose', 2: '2. Mose', 4: '4. Mose', 5: '5. Mose', 6: 'Josua', 8: 'Rut', 9: '1. Samuel', 13: '1. Chronik', 18: 'Hiob', 19: 'Psalm', 20: 'Sprüche', 21: 'Prediger', 23: 'Jesaja', 24: 'Jeremia', 25: 'Klagelieder', 26: 'Hesekiel', 33: 'Micha', 34: 'Nahum', 36: 'Zefanja', 40: 'Matthäus', 41: 'Markus', 42: 'Lukas', 43: 'Johannes', 45: 'Römer', 46: '1. Korinther', 47: '2. Korinther', 48: 'Galater', 49: 'Epheser', 50: 'Philipper', 51: 'Kolosser', 52: '1. Thessalonicher', 53: '2. Thessalonicher', 54: '1. Timotheus', 55: '2. Timotheus', 58: 'Hebräer', 59: 'Jakobus', 60: '1. Petrus', 62: '1. Johannes', 66: 'Offenbarung' };
// Buch:Kapitel:Vers oder Vers-Vers, bunt gemischt zwischen Altem und Neuem Testament
const VS_LIST = ('43:3:16 23:41:10 19:23:4 50:4:6-7 24:29:11 40:11:28 20:3:5-6 45:8:28 6:1:9 43:14:27 19:121:7-8 55:1:7 '
  + '25:3:22-23 43:16:33 23:40:31 46:13:13 19:37:5 60:5:7 1:28:15 50:4:13 19:139:14 40:6:33 23:43:1 47:12:9 '
  + '20:16:3 62:4:16 19:119:105 43:8:12 5:31:8 45:12:12 19:91:1-2 48:5:22-23 24:31:3 40:28:20 19:103:2 66:21:4 '
  + '23:26:3 43:15:5 19:27:14 58:11:1 36:3:17 45:15:13 20:4:23 43:14:6 19:16:11 52:5:16-18 4:6:24-26 41:9:23 '
  + '19:73:26 49:3:20 23:54:10 42:1:37 19:90:12 47:5:17 21:3:1 43:11:25 19:118:24 62:1:9 23:30:15 46:16:14 '
  + '2:14:14 43:10:10 59:1:5 24:17:7 45:5:8 19:145:18 49:4:32 20:16:9 40:7:7 34:1:7 51:3:23 '
  + '19:147:3 43:13:34 23:43:19 62:4:18 9:16:7 45:12:2 19:50:15 50:1:6 26:36:26 66:3:20 19:94:19 58:13:8 '
  + '20:18:10 40:5:14 23:55:8-9 46:10:13 19:86:11 42:19:10 33:6:8 45:8:38-39 19:138:8 43:1:5 18:19:25 48:6:9 '
  + '20:17:17 49:6:10 19:143:10 41:10:27 24:29:13 62:4:19 19:100:5 50:4:4 23:40:29 43:8:36 21:3:11 48:6:2 '
  + '19:1:3 58:13:5 13:16:34 40:18:20 23:46:4 45:8:31 19:103:8 54:4:12 2:15:2 66:21:5 20:27:17 43:14:1 '
  + '19:37:4 42:6:31 23:58:11 49:2:10 8:1:16 45:12:21 19:139:23-24 53:3:16 1:50:20 62:3:1 23:49:16 46:13:4 '
  + '24:33:3 59:1:17 5:31:6 43:15:13 19:25:4 58:4:16 21:4:9-10 40:5:9 1:1:1 59:4:8 46:13:7 40:6:34 '
  + '1:1:27 49:2:8-9 43:13:35').split(' ').map(s => { const [b, c, v] = s.split(':'); const [v1, v2] = v.split('-').map(Number); return { b: +b, c: +c, v1, v2: v2 || v1 }; });
const vs = { off: 0, busy: false, err: '', cur: null, seq: 0 };
const vsCfg = () => state.widgets.verse.cfg;
const vsDayIdx = d => { const t = sod(d), e = new Date(2026, 0, 1); return Math.round((t - e) / DAY); };
const vsPick = (d, off) => { const n = VS_LIST.length; return ((vsDayIdx(d) + off) % n + n) % n; };
const vsRef = r => `${VS_BOOK[r.b] || 'Buch ' + r.b} ${r.c},${r.v1}${r.v2 > r.v1 ? '-' + r.v2 : ''}`;
const vsLink = (r, tr) => `https://www.bibleserver.com/${(VS_TR[tr] || VS_TR.LUT).bs}/${encodeURIComponent((VS_BOOK[r.b] || '').replace(/\s/g, ''))}${r.c}%2C${r.v1}${r.v2 > r.v1 ? '-' + r.v2 : ''}`;
/* Text säubern: Fußnoten, Lesarten in Klammern und Auszeichnungen raus */
function vsClean(html) {
  const s = String(html || '')
    .replace(/<(sup|f)>[\s\S]*?<\/\1>/gi, '')
    .replace(/<S>\d+<\/S>/g, '')
    .replace(/\u2009?\[\d+\]/g, '')
    .replace(/(\p{L})"s\b/gu, '$1’s')
    .replace(/<i>\s*\([^<]*\)\s*<\/i>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ');
  const t = new DOMParser().parseFromString(`<p>${s}</p>`, 'text/html').body.textContent || '';
  return t.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
}
async function vsLoad(force) {
  const tr = vsCfg().tr, now = new Date(), i = vsPick(now, vs.off), r = VS_LIST[i];
  const key = `${ymd(now)}|${tr}|${i}`;
  const c = lsGet(VS_CACHE);
  if (!force && c && c.key === key && c.text) { vs.cur = c; vs.err = ''; renderVerseAll(); return; }
  const seq = ++vs.seq;
  vs.busy = true;
  renderVerseAll();
  try {
    const list = await getJson(`https://bolls.life/get-text/${tr}/${r.b}/${r.c}/`, 12000);
    if (seq !== vs.seq) return;
    const parts = (Array.isArray(list) ? list : []).filter(x => x.verse >= r.v1 && x.verse <= r.v2).sort((a, b) => a.verse - b.verse).map(x => vsClean(x.text)).filter(Boolean);
    if (!parts.length) throw new Error('leer');
    vs.cur = { key, text: parts.join(' '), ref: vsRef(r), link: vsLink(r, tr), tr };
    vs.err = '';
    lsSet(VS_CACHE, vs.cur);
  } catch {
    if (seq !== vs.seq) return;
    vs.err = 'Der Vers konnte gerade nicht geladen werden. Das Cockpit versucht es gleich nochmal.';
    setTimeout(() => { if (!vs.cur || vs.cur.key !== key) vsLoad(); }, 3 * 6e4);
  } finally {
    if (seq === vs.seq) { vs.busy = false; renderVerseAll(); }
  }
}
let vsDay = '';
function renderVerse() {
  const now = new Date(), tr = vsCfg().tr, i = vsPick(now, vs.off);
  const want = `${ymd(now)}|${tr}|${i}`;
  if (!vs.busy && (!vs.cur || vs.cur.key !== want) && !vs.err) { vsLoad(); return; }
  const c = vs.cur && vs.cur.key === want ? vs.cur : null;
  $('#vs-text').textContent = c ? c.text : vs.err || 'Vers wird geladen …';
  $('#vs-text').classList.toggle('muted', !c);
  const ref = $('#vs-ref');
  ref.hidden = !c;
  if (c) { ref.textContent = c.ref; ref.href = c.link; ref.title = `${c.ref} im Zusammenhang auf bibleserver.com lesen`; }
  $('#vs-tr').textContent = (VS_TR[tr] || VS_TR.LUT).name;
  $('#vs-more').disabled = vs.busy;
  $('#vs-back').hidden = vs.off === 0;
}
function renderVerseAll() { if (views.has('verse')) renderVerse(); renderMirror(); }
/* Neuer Tag: wieder beim Vers des Tages anfangen */
function vsTick(now) {
  const k = ymd(now);
  if (k === vsDay) return;
  const first = !vsDay;
  vsDay = k;
  if (!first) { vs.off = 0; vs.err = ''; if (views.has('verse')) renderVerse(); }
}
$('#vs-more').addEventListener('click', () => { vs.off++; vs.err = ''; vsLoad(); });
$('#vs-back').addEventListener('click', () => { vs.off = 0; vs.err = ''; vsLoad(); });

defineWidget('verse', {
  render: renderVerse,
  settings: {
    render(box, w) {
      box.innerHTML = `<label class="field"><span class="lbl">Übersetzung</span><select data-s="tr">${Object.entries(VS_TR).map(([k, t]) => `<option value="${k}"${k === w.cfg.tr ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label><p class="hint">Die Texte kommen von bolls.life. Unter dem Vers führt ein Link zur Stelle auf bibleserver.com, dort kannst du den ganzen Abschnitt lesen.</p>`;
    },
    save(box, w) { w.cfg.tr = box.querySelector('[data-s="tr"]').value; vs.err = ''; return null; }
  }
});
