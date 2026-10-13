/* Sortieren per Ziehen (Maus, Finger, Stift) und per Pfeiltasten am Griff. Für die Kacheln oben und die Bausteine im Spiegel.
 * box: die Liste, item: Selektor der Einträge (mit data-key), handle: Selektor des Griffs, when(): darf gerade sortiert werden,
 * done(keys): neue Reihenfolge aller Einträge. Die Einträge rutschen live an ihren neuen Platz, die anderen gleiten hinterher. */
function sortable(box, { item, handle, done, when }) {
  const all = () => [...box.querySelectorAll(item)];
  const keys = () => all().map(x => x.dataset.key);
  const shown = () => all().filter(x => !x.hidden);
  function flip(fn) {
    const els = all(), before = new Map(els.map(el => [el, el.getBoundingClientRect()]));
    fn();
    if (reduceMotion) return;
    for (const el of els) {
      if (el.hidden || el.classList.contains('sort-drag')) continue;
      const a = before.get(el), b = el.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
      if (dx || dy) el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.7,.2,1)' });
    }
  }
  box.addEventListener('pointerdown', e => {
    if (e.button !== 0 || (when && !when())) return;
    const h = e.target.closest(handle);
    if (!h || !box.contains(h)) return;
    const it = h.closest(item);
    if (!it) return;
    const ctl = e.target.closest('input,select,textarea,a,button,.sel-btn');
    if (ctl && ctl !== h && !h.contains(ctl)) return;
    const x0 = e.clientX, y0 = e.clientY;
    let on = false;
    const move = ev => {
      if (!on) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
        on = true;
        it.classList.add('sort-drag');
        box.classList.add('sorting');
        try { h.setPointerCapture(ev.pointerId); } catch { /* Zeiger schon weg */ }
      }
      ev.preventDefault();
      let best = null, bd = Infinity;
      for (const s of shown()) {
        if (s === it) continue;
        const r = s.getBoundingClientRect(), d = Math.hypot(ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2));
        if (d < bd) { bd = d; best = s; }
      }
      if (!best) return;
      const r = best.getBoundingClientRect();
      // Liegen Einträge nebeneinander, entscheidet die Waagerechte, sonst die Senkrechte
      const row = Math.abs(r.top - it.getBoundingClientRect().top) < r.height / 2;
      const before = row ? ev.clientX < r.left + r.width / 2 : ev.clientY < r.top + r.height / 2;
      const ref = before ? best : best.nextElementSibling;
      if (ref !== it && it.nextElementSibling !== ref) flip(() => box.insertBefore(it, ref));
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      if (!on) return;
      it.classList.remove('sort-drag');
      box.classList.remove('sorting');
      // Der Klick nach dem Loslassen soll nichts auslösen
      const kill = ev => { ev.stopPropagation(); ev.preventDefault(); };
      addEventListener('click', kill, { capture: true, once: true });
      setTimeout(() => removeEventListener('click', kill, true), 80);
      setTimeout(() => done(keys()), 0);
    };
    addEventListener('pointermove', move, { passive: false });
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  });
  box.addEventListener('keydown', e => {
    if (when && !when()) return;
    const h = e.target.closest(handle);
    if (!h || !box.contains(h)) return;
    const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft', fwd = e.key === 'ArrowDown' || e.key === 'ArrowRight';
    if (!back && !fwd) return;
    const it = h.closest(item), vis = shown(), i = vis.indexOf(it);
    if (i < 0) return;
    e.preventDefault();
    const j = i + (back ? -1 : 1);
    if (j < 0 || j >= vis.length) return;
    flip(() => box.insertBefore(it, back ? vis[j] : vis[j].nextElementSibling));
    h.focus({ preventScroll: true });
    done(keys());
  });
}
