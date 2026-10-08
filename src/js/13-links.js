/* Schnellzugriff: jede Kopie hat ihre eigene Linkliste (cfg.items) */
const linksOf = v => state.widgets[v.id].cfg.items;
function renderLinks(v) {
  const ul = v.q('[data-r="list"]'), items = linksOf(v);
  ul.textContent = '';
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.style.gridColumn = '1 / -1';
    li.textContent = 'Leg hier deine wichtigsten Seiten ab, zum Beispiel Webmail, Ticketsystem oder Wiki.';
    ul.appendChild(li);
    return;
  }
  for (const l of items) {
    let host = '';
    try { host = new URL(l.url).hostname.replace(/^www\./, ''); } catch { host = l.url; }
    const name = l.name || host;
    const li = document.createElement('li');
    li.className = 'ql';
    li.innerHTML = `<a target="_blank" rel="noopener noreferrer"><span class="av"></span><span class="tx"><span class="nm"></span><span class="dom"></span></span></a><button type="button" class="icon-btn" data-ledit="${esc(l.id)}">${PENCIL}</button>`;
    li.querySelector('a').href = l.url;
    li.querySelector('.av').textContent = (name.match(/[\p{L}\p{N}]/u) || ['•'])[0];
    li.querySelector('.nm').textContent = name;
    li.querySelector('.dom').textContent = host;
    li.querySelector('[data-ledit]').setAttribute('aria-label', `${name} bearbeiten`);
    ul.appendChild(li);
  }
}
function openLinkForm(v, l) {
  const q = v.q;
  v.editing = l ? l.id : null;
  q('[data-r="form-title"]').textContent = l ? `${l.name || 'Link'} bearbeiten` : 'Neuer Link';
  q('[data-r="name"]').value = l ? l.name : '';
  q('[data-r="url"]').value = l ? l.url : '';
  q('[data-r="del"]').hidden = !l;
  q('[data-r="err"]').hidden = true;
  q('[data-r="form"]').hidden = false;
  (l ? q('[data-r="name"]') : q('[data-r="url"]')).focus();
}
function closeLinkForm(v) { v.q('[data-r="form"]').hidden = true; v.editing = null; }
defineWidget('links', {
  mount(v) {
    const q = v.q;
    v.editing = null;
    q('[data-r="add"]').addEventListener('click', () => { if (q('[data-r="form"]').hidden || v.editing) openLinkForm(v, null); else closeLinkForm(v); });
    q('[data-r="cancel"]').addEventListener('click', () => closeLinkForm(v));
    q('[data-r="list"]').addEventListener('click', e => {
      const b = e.target.closest('[data-ledit]');
      if (!b) return;
      const l = linksOf(v).find(x => x.id === b.dataset.ledit);
      if (l) openLinkForm(v, l);
    });
    q('[data-r="form"]').addEventListener('submit', e => {
      e.preventDefault();
      const fail = m => { q('[data-r="err"]').textContent = m; q('[data-r="err"]').hidden = false; };
      const url = safeUrl(q('[data-r="url"]').value);
      if (!url) return fail('Das sieht nicht nach einer Webadresse aus.');
      const items = linksOf(v);
      if (!v.editing && items.length >= 40) return fail('Mehr als 40 Links gehen nicht.');
      const link = { id: v.editing || uid(), name: q('[data-r="name"]').value.trim(), url };
      const i = items.findIndex(x => x.id === link.id);
      if (i >= 0) items[i] = link; else items.push(link);
      closeLinkForm(v);
      commit();
    });
    q('[data-r="del"]').addEventListener('click', () => {
      const items = linksOf(v), i = items.findIndex(x => x.id === v.editing);
      if (i < 0) return;
      const [removed] = items.splice(i, 1);
      closeLinkForm(v);
      commit();
      toast(`„${removed.name || 'Link'}“ gelöscht`, () => { const w = state.widgets[v.id]; if (!w) return; w.cfg.items.splice(Math.min(i, w.cfg.items.length), 0, removed); commit(); });
    });
  },
  render(v) { renderLinks(v); }
});
