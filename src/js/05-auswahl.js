/* Auswahlfelder im eigenen Look: Am Rechner bekommt jedes <select> einen Knopf mit einer Liste im Glas-Look,
 * die im hellen und im dunklen Modus gleich gut aussieht. Das echte <select> bleibt unsichtbar darunter liegen,
 * alle anderen Module lesen und setzen also weiter einfach .value und hören auf „change“.
 * Am Handy (Finger statt Maus) bleibt die native Auswahl, die ist dort am besten zu bedienen. */
const SEL_ON = typeof HTMLElement.prototype.showPopover === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
const SEL_CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg>';
const sp = { sel: null, btn: null, pop: null, i: -1, typed: '', typedAt: 0 };
const selText = sel => { const o = sel.options[sel.selectedIndex]; return o ? o.textContent.trim() : ''; };
function selSync(sel) {
  const b = sel._selBtn;
  if (!b) return;
  b.querySelector('.sel-tx').textContent = selText(sel) || ' ';
  b.hidden = sel.hidden;
  b.disabled = sel.disabled;
}
function selEnhance(sel) {
  if (sel.dataset.enh || sel.multiple || sel.size > 1) return;
  sel.dataset.enh = '1';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `sel-btn ${sel.className}`.trim();
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = `<span class="sel-tx"></span>${SEL_CHEV}`;
  // Name für Screenreader: Beschriftung des Feldes plus der gewählte Eintrag
  const lab = sel.labels && sel.labels[0], tx = btn.querySelector('.sel-tx');
  tx.id = 'sx-' + uid();
  if (lab) {
    const lt = lab.querySelector('.lbl') || lab;
    if (!lt.id) lt.id = 'sl-' + uid();
    btn.setAttribute('aria-labelledby', `${lt.id} ${tx.id}`);
    btn.dataset.lbl = lt.id;
  } else if (sel.getAttribute('aria-label')) btn.setAttribute('aria-label', sel.getAttribute('aria-label'));
  if (sel.title) btn.title = sel.title;
  sel.classList.add('sel-native');
  sel.tabIndex = -1;
  sel.setAttribute('aria-hidden', 'true');
  sel.after(btn);
  sel._selBtn = btn;
  // Wer das Feld per Code setzt, soll den neuen Wert auch im Knopf sehen
  for (const k of ['value', 'selectedIndex']) {
    const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, k);
    Object.defineProperty(sel, k, { configurable: true, get() { return d.get.call(this); }, set(x) { d.set.call(this, x); selSync(this); } });
  }
  new MutationObserver(() => selSync(sel)).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled', 'selected'] });
  sel.addEventListener('change', () => selSync(sel));
  sel.addEventListener('focus', () => btn.focus());
  btn.addEventListener('click', () => (sp.sel === sel ? selClose(true) : selOpen(sel)));
  btn.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); selOpen(sel); }
  });
  selSync(sel);
}
function selOpen(sel) {
  selClose(false);
  const btn = sel._selBtn;
  if (!btn || btn.disabled) return;
  const pop = document.createElement('div');
  pop.className = 'sel-pop';
  pop.setAttribute('popover', 'manual');
  pop.setAttribute('role', 'listbox');
  pop.tabIndex = -1;
  if (btn.dataset.lbl) pop.setAttribute('aria-labelledby', btn.dataset.lbl);
  else if (btn.getAttribute('aria-label')) pop.setAttribute('aria-label', btn.getAttribute('aria-label'));
  let html = '', grp = null;
  [...sel.options].forEach((o, i) => {
    const g = o.parentElement && o.parentElement.tagName === 'OPTGROUP' ? o.parentElement : null;
    if (g !== grp) { grp = g; if (g) html += `<div class="sel-grp" role="presentation">${esc(g.label)}</div>`; }
    html += `<div class="sel-opt" role="option" id="so-${i}" data-i="${i}" aria-selected="${i === sel.selectedIndex}"${o.disabled ? ' aria-disabled="true"' : ''}><span>${esc(o.textContent.trim())}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>`;
  });
  pop.innerHTML = html || '<div class="sel-grp">Keine Einträge</div>';
  // In einem offenen Dialog muss die Liste im Dialog hängen, sonst ist sie nicht anklickbar
  (sel.closest('dialog[open]') || document.body).appendChild(pop);
  Object.assign(sp, { sel, btn, pop, i: sel.selectedIndex, typed: '' });
  pop.showPopover();
  selPlace();
  selActive(sel.selectedIndex, true);
  btn.setAttribute('aria-expanded', 'true');
  pop.focus({ preventScroll: true });
  pop.addEventListener('keydown', selKey);
  pop.addEventListener('click', e => { const o = e.target.closest('.sel-opt'); if (o && o.getAttribute('aria-disabled') !== 'true') selPick(+o.dataset.i); });
  pop.addEventListener('pointermove', e => { const o = e.target.closest('.sel-opt'); if (o && +o.dataset.i !== sp.i) selActive(+o.dataset.i, false); });
  pop.addEventListener('focusout', e => { if (sp.pop === pop && !pop.contains(e.relatedTarget) && e.relatedTarget !== btn) selClose(false); });
}
/* Unter den Knopf legen, bei wenig Platz darüber, nie über den Rand hinaus */
function selPlace() {
  const { btn, pop } = sp;
  if (!pop) return;
  const r = btn.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, m = 8;
  if (!r.width && !r.height) { selClose(false); return; }
  pop.style.minWidth = Math.round(r.width) + 'px';
  pop.style.maxHeight = '';
  const full = pop.offsetHeight, below = vh - r.bottom - m - 6, above = r.top - m - 6;
  const up = full > below && above > below;
  pop.style.maxHeight = Math.floor(Math.max(100, up ? above : below)) + 'px';
  const w = Math.min(pop.offsetWidth, vw - 2 * m), h = pop.offsetHeight;
  pop.style.left = Math.round(Math.max(m, Math.min(r.left, vw - w - m))) + 'px';
  pop.style.top = Math.round(up ? r.top - 6 - h : r.bottom + 6) + 'px';
  pop.dataset.up = String(up);
}
function selActive(i, center) {
  const { pop } = sp;
  if (!pop) return;
  sp.i = i;
  for (const o of pop.querySelectorAll('.sel-opt.on')) o.classList.remove('on');
  const o = pop.querySelector(`[data-i="${i}"]`);
  if (!o) { pop.removeAttribute('aria-activedescendant'); return; }
  o.classList.add('on');
  pop.setAttribute('aria-activedescendant', o.id);
  if (center) pop.scrollTop = Math.max(0, o.offsetTop - (pop.clientHeight - o.offsetHeight) / 2);
  else o.scrollIntoView({ block: 'nearest' });
}
function selPick(i) {
  const sel = sp.sel;
  if (!sel) return;
  if (i >= 0 && i !== sel.selectedIndex) {
    sel.selectedIndex = i;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  selClose(true);
}
function selClose(refocus) {
  const { pop, btn } = sp;
  if (!pop) return;
  Object.assign(sp, { sel: null, btn: null, pop: null, i: -1 });
  try { pop.hidePopover(); } catch { /* schon zu */ }
  pop.remove();
  if (btn) { btn.setAttribute('aria-expanded', 'false'); if (refocus && btn.isConnected) btn.focus({ preventScroll: true }); }
}
function selKey(e) {
  const opts = [...sp.pop.querySelectorAll('.sel-opt:not([aria-disabled="true"])')].map(o => +o.dataset.i);
  if (!opts.length && e.key !== 'Escape' && e.key !== 'Tab') return;
  const at = opts.indexOf(sp.i), go = n => { e.preventDefault(); selActive(opts[Math.max(0, Math.min(opts.length - 1, n))], false); };
  switch (e.key) {
    case 'ArrowDown': return go(at < 0 ? 0 : at + 1);
    case 'ArrowUp': return go(at < 0 ? opts.length - 1 : at - 1);
    case 'Home': return go(0);
    case 'End': return go(opts.length - 1);
    case 'PageDown': return go(at + 8);
    case 'PageUp': return go(at - 8);
    case 'Enter': case ' ': e.preventDefault(); return selPick(sp.i);
    case 'Escape': e.preventDefault(); e.stopPropagation(); return selClose(true);
    case 'Tab': return selClose(true);
  }
  // Tippen springt zum passenden Eintrag
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const now = Date.now();
    sp.typed = (now - sp.typedAt > 700 ? '' : sp.typed) + e.key.toLowerCase();
    sp.typedAt = now;
    const hit = opts.find(i => sp.sel.options[i].textContent.trim().toLowerCase().startsWith(sp.typed));
    if (hit !== undefined) go(opts.indexOf(hit));
  }
}
if (SEL_ON) {
  document.documentElement.classList.add('sel-on');
  for (const s of document.querySelectorAll('select')) selEnhance(s);
  new MutationObserver(list => {
    for (const m of list) for (const n of m.addedNodes) {
      if (n.nodeType !== 1 || n.closest('template')) continue;
      if (n.tagName === 'SELECT') selEnhance(n);
      else if (n.firstElementChild) for (const s of n.getElementsByTagName('select')) selEnhance(s);
    }
  }).observe(document.body, { childList: true, subtree: true });
  addEventListener('resize', () => selClose(false));
  document.addEventListener('scroll', e => { if (sp.pop && !sp.pop.contains(e.target)) selPlace(); }, true);
  document.addEventListener('pointerdown', e => { if (sp.pop && !sp.pop.contains(e.target) && !sp.btn.contains(e.target)) selClose(false); }, true);
}
