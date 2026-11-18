// Kosmora layout tweaks: card-size control for the multi-pack summary grid. Display-only:
// no requests, never clicks anything on the page. The CSS lives in layout.css.
(() => {
  if (window.__kqsLayout) return;
  window.__kqsLayout = true;

  const KEY = 'kqs.cols';
  const MIN = 3, MAX = 10, DEF = 5;
  let cols = DEF;
  try { cols = Math.min(MAX, Math.max(MIN, parseInt(localStorage.getItem(KEY), 10) || DEF)); } catch (e) { /* ignore */ }

  const root = document.documentElement;
  let pill = null;

  function apply() {
    root.style.setProperty('--kqs-cols', String(cols));
    if (pill) pill.querySelector('span').textContent = cols + ' per row';
  }

  function set(n) {
    cols = Math.min(MAX, Math.max(MIN, n));
    try { localStorage.setItem(KEY, String(cols)); } catch (e) { /* ignore */ }
    apply();
  }

  function makePill() {
    pill = document.createElement('div');
    pill.id = 'kqs-cols';
    pill.title = 'Card size (KosLess). Keys: - and =';
    pill.innerHTML = '<button type="button" aria-label="Bigger cards">−</button><span></span><button type="button" aria-label="Smaller cards">+</button>';
    const [less, more] = pill.querySelectorAll('button');
    less.addEventListener('click', (ev) => { ev.stopPropagation(); set(cols - 1); });
    more.addEventListener('click', (ev) => { ev.stopPropagation(); set(cols + 1); });
    document.body.appendChild(pill);
    apply();
  }

  const gridShown = () => !!document.querySelector('.ko-grid.ko-grid-many:not(.t3d-grid)');

  function sync() {
    const on = gridShown() && innerWidth >= 900;
    if (on && !pill) makePill();
    if (pill) pill.classList.toggle('kqs-on', on);
  }

  // "-" = fewer per row (bigger cards), "=" or "+" = more per row. Only while the grid is up
  // and focus isn't in a text field.
  addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (!/^[-=+]$/.test(ev.key)) return;
    const t = ev.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (!gridShown()) return;
    set(cols + (ev.key === '-' ? -1 : 1));
  }, true);

  let pending = 0;
  new MutationObserver(() => {
    if (pending) return;
    pending = setTimeout(() => { pending = 0; sync(); }, 200);
  }).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('resize', sync);

  apply();
  sync();
})();
