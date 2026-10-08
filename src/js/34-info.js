/* Infofenster für Vereine, Fahrer und Teams, mit Kurztext aus Wikipedia */
const wikiCache = new Map();
const info = { key: '' };
async function wikiSummary(titles, lang = 'de') {
  for (const t of titles.filter(Boolean)) {
    const k = `${lang}:${t}`;
    if (wikiCache.has(k)) { const c = wikiCache.get(k); if (c) return c; continue; }
    let r = null;
    try {
      const j = await getJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g, '_'))}`, 8000);
      if (j && j.extract && j.type !== 'disambiguation') {
        r = { title: j.title, text: j.extract, url: (j.content_urls && j.content_urls.desktop && j.content_urls.desktop.page) || '', img: (j.thumbnail && j.thumbnail.source) || '' };
      }
    } catch { r = null; }
    wikiCache.set(k, r);
    if (r) return r;
  }
  return null;
}
async function wikiSearch(q, lang = 'de') {
  try {
    const j = await getJson(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=1&format=json&origin=*`, 8000);
    const hit = j && j.query && j.query.search && j.query.search[0];
    return hit ? hit.title : null;
  } catch { return null; }
}
const safeImg = u => /^https:\/\//.test(String(u || '')) ? String(u) : '';
/* Fenster öffnen. html enthält optional <div data-r="wiki"> und weitere Platzhalter, die später gefüllt werden. */
function openInfo(key, title, html, wikiP) {
  info.key = key;
  $('#info-h').textContent = title;
  const body = $('#info-body');
  body.innerHTML = html;
  body.scrollTop = 0;
  const w = body.querySelector('[data-r="wiki"]');
  if (w && wikiP) {
    w.innerHTML = '<p class="hint">Kurzinfo von Wikipedia wird geladen …</p>';
    Promise.resolve(wikiP).then(r => {
      if (info.key !== key) return;
      if (!r) { w.remove(); return; }
      w.innerHTML = `${safeImg(r.img) ? `<img src="${esc(safeImg(r.img))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<p></p><a class="btn-ghost" target="_blank" rel="noopener">Mehr auf Wikipedia ↗</a>`;
      w.querySelector('p').textContent = r.text;
      if (/^https:\/\//.test(r.url)) w.querySelector('a').href = r.url; else w.querySelector('a').remove();
    }).catch(() => { if (info.key === key) w.remove(); });
  }
  if (!$('#dlg-info').open) $('#dlg-info').showModal();
}
/* Teil des offenen Fensters nachträglich füllen, falls es noch dasselbe ist */
function fillInfo(key, sel, html) {
  if (info.key !== key || !$('#dlg-info').open) return;
  const el = $('#info-body').querySelector(sel);
  if (el) el.innerHTML = html;
}
$('#dlg-info').addEventListener('close', () => { info.key = ''; });
