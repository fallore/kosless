// KosLess hotkeys (Nov 17, 2026): navigation, pack opening, album adds, auto-skip and
// auto-dismiss. Rebuilt from KosMore 1.8.0's behaviour (its selectors and album call), not its code.
// Settings: settings.js (window.__kq). Every action is a key the player presses, except auto-skip and
// auto-dismiss, which press Kosmora's own button after a short random delay.
(() => {
  if (window.__kqKeys) return;
  window.__kqKeys = true;
  const kq = window.__kq;
  if (!kq) return;

  const OPEN = '/packs/open';
  const SEL = {
    modal: 'dialog[open], [aria-modal="true"]:not(dialog)',
    summary: '.ko-summary',
    dropBtn: 'button.ko-drop-btn',
    gridOpen: '.ko-grid > li > button.ko-grid-open',
    scene: '.ko-scene:not(.ko-summary-scene)',
    skip: 'button.ko-skip:not(.ko-later):not(.ko-talents)',
    skipNote: ".ko-skip-note, [data-testid='skip-note']",
    packReady: '.ko-pack-intro, .ko-pack-ready',
    nextPack: '.op-actions-stack > button.btn-gold.btn-lg',
    backToPacks: '.op-actions-stack > a.btn-gold.btn-lg[href="/packs"]',
  };
  const MODIFIERS = new Set(['Alt', 'AltGraph', 'CapsLock', 'Control', 'Fn', 'FnLock', 'Meta', 'NumLock', 'ScrollLock', 'Shift', 'Symbol', 'SymbolLock']);
  const rand = (a, b) => a + Math.random() * (b - a);
  const S = () => kq.settings;

  const visible = (e) => !!e && !e.closest('[hidden], [inert], [aria-hidden="true"]') && e.getClientRects().length > 0 && getComputedStyle(e).visibility === 'visible';
  const usable = (e) => visible(e) && !e.matches(':disabled, [aria-disabled="true"]');
  const find = (root, sel) => [...(root || document).querySelectorAll(sel)].find(usable);
  function topModal() {
    const m = [...document.querySelectorAll(SEL.modal)].filter(visible);
    return m.filter((e) => { try { return e.matches(':modal'); } catch (x) { return false; } }).at(-1) || m.at(-1);
  }
  const openingId = () => { const p = new URLSearchParams(location.search); return (p.get('id') || p.get('resume') || '').toLowerCase(); };
  function consume(ev) { ev.preventDefault(); ev.stopImmediatePropagation(); }

  // ---- which card: under the mouse, else the one focused on a summary ----
  let mx = -1, my = -1;
  addEventListener('mousemove', (ev) => { mx = ev.clientX; my = ev.clientY; }, { passive: true, capture: true });
  // Pointer left the window (other monitor, Alt+Tab): don't aim at whatever was under it last.
  document.addEventListener('mouseout', (ev) => { if (!ev.relatedTarget) { mx = -1; my = -1; } }, true);
  addEventListener('blur', () => { mx = -1; my = -1; });
  let focusedLi = null;

  function cardRoot(el) {
    for (let n = el, i = 0; n && n !== document.body && i < 12; n = n.parentElement, i++) {
      const imgs = n.querySelectorAll ? n.querySelectorAll('img.kc-img') : [];
      if (imgs.length === 1) {
        // climb to the grid cell if there is one, so the tag lands on the cell
        return n.closest('.ko-grid > li') || n.closest('.ko-card') || n;
      }
      if (imgs.length > 1) return null;
    }
    return null;
  }
  function cardOf(root) {
    const img = root && root.querySelector('img.kc-img');
    if (!img) return null;
    const src = [img.currentSrc, img.getAttribute('src'), img.getAttribute('srcset')].filter(Boolean).join(' ');
    const m = src.match(/\/media\/cards\/(\d+)\//);
    if (!m) return null;
    return { id: m[1], name: img.getAttribute('alt') || 'card ' + m[1], veil: !!root.querySelector('.kc-veil'), fullArt: !!root.querySelector('.kc-fa'), root };
  }
  function targetCard() {
    if (mx >= 0) {
      const el = document.elementFromPoint(mx, my);
      const root = el && cardRoot(el);
      const c = root && cardOf(root);
      if (c) return c;
    }
    if (focusedLi && focusedLi.isConnected) return cardOf(focusedLi);
    return null;
  }

  // ---- album add ----
  const busy = new Set();
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  async function addToAlbum(album) {
    if (!UUID.test(String(album.id))) { kq.toast('That album shortcut is invalid; re-add it in settings', 'err'); return; }
    const c = targetCard();
    if (!c) { kq.toast('Point at a card first', 'err'); return; }
    const k = album.id + ':' + c.id;
    if (busy.has(k)) return;
    busy.add(k);
    try {
      const r = await fetch('/api/collection/' + c.id, { credentials: 'include', headers: { Accept: 'application/json' } });
      if (r.status === 429) throw new Error('rate limited, try again in a bit');
      if (!r.ok) throw new Error('card read ' + r.status);
      const col = await r.json();
      const inAlbum = (col.albums || []).some((a) => (a && (a.id || a)) === album.id);
      if (inAlbum) { kq.toast(c.name + ' is already in ' + album.name); tag(c.root, album.name); return; }
      const all = col.copies || [];
      if (!all.length) { kq.toast("You don't have a copy of " + c.name, 'err'); return; }
      const free = all.filter((x) => !x.state || x.state === 'available');
      const copies = free.length ? free : all;
      const fa = (x) => !!(x.fullArt || x.full_art || x.fullart);
      const same = copies.filter((x) => !!x.veil === c.veil && fa(x) === c.fullArt);
      const pool = same.length ? same : copies;
      pool.sort((a, b) => String(b.acquired_at || '').localeCompare(String(a.acquired_at || '')));
      const copy = pool[0];
      const w = await fetch('/api/albums/' + album.id + '/items', {
        method: 'POST', credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'x-kosmora': '1' },
        body: JSON.stringify({ subjectIds: [c.id], copyId: copy.id }),
      });
      if (w.status === 429) throw new Error('rate limited, try again in a bit');
      if (!w.ok) {
        let msg = '';
        try { const j = await w.json(); msg = j.error || j.message || ''; } catch (e) { /* ignore */ }
        throw new Error('album add ' + w.status + (msg ? ': ' + msg : ''));
      }
      kq.toast('Added ' + c.name + ' to ' + album.name, 'ok');
      tag(c.root, album.name);
    } catch (e) {
      kq.toast(c.name + ': ' + (e.message || e), 'err');
    } finally {
      busy.delete(k);
    }
  }
  function tag(root, name) {
    if (!root) return;
    let t = root.querySelector(':scope > .kq-album-tag');
    if (!t) {
      t = document.createElement('div');
      t.className = 'kq-album-tag';
      if (getComputedStyle(root).position === 'static') root.style.position = 'relative';
      root.appendChild(t);
    }
    t.textContent = '→ ' + name;
  }

  // ---- navigation ----
  function go(path) {
    const a = [...document.querySelectorAll('a[href]')].find((x) => x.getAttribute('href') === path && usable(x));
    if (a) a.click(); else location.assign(path);
  }

  // ---- summary focus ----
  function gridButtons() {
    const sum = find(document, SEL.summary) || document;
    return [...sum.querySelectorAll(SEL.gridOpen)].filter(usable);
  }
  function focusGrid(which) {
    const list = gridButtons();
    if (!list.length) return false;
    const cur = focusedLi && focusedLi.isConnected ? list.findIndex((b) => b.parentElement === focusedLi) : -1;
    let i = which === 'first' ? 0 : which === 'last' ? list.length - 1 : which === 'next' ? cur + 1 : (cur < 0 ? list.length - 1 : cur - 1);
    i = Math.max(0, Math.min(list.length - 1, i));
    focusedLi?.classList.remove('kq-focus');
    focusedLi = list[i].parentElement;
    focusedLi.classList.add('kq-focus');
    list[i].focus({ preventScroll: true });
    focusedLi.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    mx = -1; my = -1;   // keys now drive the target until the mouse moves again
    return true;
  }

  // ---- auto-skip / auto-dismiss ----
  const SKIP_KEY = 'kq.skipped.';
  let pendingSkip = null;   // { from, until, target }
  let skipTimer = 0;
  function armSkip() {
    const s = S();
    if (!s.pack.enabled || !s.pack.autoSkip) return;
    pendingSkip = { from: openingId(), until: Date.now() + 15000 };
  }
  function tryAutoSkip() {
    const p = pendingSkip;
    if (!p || skipTimer) return;
    if (location.pathname !== OPEN || Date.now() > p.until) { pendingSkip = null; return; }
    const params = new URLSearchParams(location.search);
    const id = openingId();
    if (!id || id === p.from || params.get('replay') === '1' || params.get('recap') === '1') return;
    try { if (sessionStorage.getItem(SKIP_KEY + id)) { pendingSkip = null; return; } } catch (e) { /* ignore */ }
    const scene = find(document, SEL.scene);
    if (!scene) return;
    if (scene.querySelector(SEL.skipNote) || topModal() || find(scene, '.ko-pack-burst, .ko-table:not(.ko-table-ahead)')) { pendingSkip = null; return; }
    if (!find(scene, SEL.packReady) || !find(scene, SEL.skip)) return;
    if (scene.dataset.hints !== 'on') { pendingSkip = null; return; }   // without hints a special pack could be skipped blind
    skipTimer = setTimeout(() => {
      skipTimer = 0;
      const sc = find(document, SEL.scene);
      const btn = sc && find(sc, SEL.skip);
      if (!pendingSkip || !btn || openingId() !== id || sc.querySelector(SEL.skipNote) || topModal()) return;
      pendingSkip = null;
      try { sessionStorage.setItem(SKIP_KEY + id, '1'); } catch (e) { /* ignore */ }
      btn.click();
    }, rand(350, 900));
  }
  let dismissed = new WeakSet();
  let dismissTimer = 0;
  function tryAutoDismiss() {
    const s = S();
    if (!s.pack.enabled || !s.pack.autoDismiss || location.pathname !== OPEN || dismissTimer) return;
    const m = topModal();
    if (!m) { dismissed = new WeakSet(); return; }   // popup closed: if Kosmora reuses the element, the next one still counts
    if (!m.matches('.ko-drop') || dismissed.has(m)) return;
    if (!m.classList.contains('ko-drop-rogue') && !m.classList.contains('ko-drop-mega')) return;
    dismissed.add(m);
    dismissTimer = setTimeout(() => {
      dismissTimer = 0;
      const b = m.isConnected && find(m, SEL.dropBtn);
      if (b) b.click();
    }, rand(500, 1200));
  }
  let pend = 0;
  new MutationObserver(() => {
    if (pend) return;
    pend = setTimeout(() => { pend = 0; try { tryAutoDismiss(); tryAutoSkip(); } catch (e) { console.warn('[kq-keys]', e); } }, 120);
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'open', 'data-hints'] });

  // A mouse click on Next pack arms auto-skip too.
  addEventListener('click', (ev) => {
    if (location.pathname !== OPEN || !(ev.target instanceof Element)) return;
    if (ev.target.closest(SEL.summary + ' ' + SEL.nextPack)) armSkip();
  }, true);

  // ---- keys ----
  let handled = '';
  addEventListener('keydown', (ev) => {
    if (!ev.isTrusted) return;   // our own synthetic ArrowRight (next card) must not re-enter here
    if (ev.defaultPrevented || ev.isComposing || kq.typing(ev.target) || document.getElementById('kq-settings')) return;
    if (ev.repeat) { if (handled === ev.code) consume(ev); return; }
    handled = '';
    const s = S();
    const combo = kq.comboOf(ev);
    const onOpen = location.pathname === OPEN;

    // Found-pack popup: any key (or none) dismisses it before anything else.
    if (onOpen && s.pack.enabled) {
      const m = topModal();
      if (m && m.matches('.ko-drop')) {
        const browserKey = ev.ctrlKey || ev.metaKey || ev.altKey || /^F\d{1,2}$/.test(ev.key);
        if (s.pack.anyKeyDismiss && !MODIFIERS.has(ev.key) && !browserKey) {
          const b = find(m, SEL.dropBtn);
          if (b) { consume(ev); handled = ev.code; b.click(); }
        }
        return;
      }
    }
    if (!combo) return;

    // Album shortcuts
    if (s.albums.enabled) {
      const a = s.albums.list.find((x) => x.key && x.key === combo);
      if (a && targetCard()) { consume(ev); handled = ev.code; addToAlbum(a); return; }
    }

    // Pack opening
    if (onOpen && s.pack.enabled) {
      const action = Object.keys(s.pack.keys).find((k) => s.pack.keys[k] === combo);
      if (action) {
        const sum = find(document, SEL.summary);
        if (sum) {
          if (action === 'nextPack') {
            const b = find(sum, SEL.nextPack) || find(sum, SEL.backToPacks);
            if (b) { consume(ev); handled = ev.code; if (b.matches(SEL.nextPack)) armSkip(); b.click(); }
          } else if (action === 'nextCard' || action === 'previousCard' || action === 'firstCard' || action === 'lastCard') {
            const w = { nextCard: 'next', previousCard: 'prev', firstCard: 'first', lastCard: 'last' }[action];
            if (focusGrid(w)) { consume(ev); handled = ev.code; }
          } else if (action === 'seeCard') {
            const c = focusedLi && focusedLi.isConnected ? cardOf(focusedLi) : targetCard();
            if (c) { consume(ev); handled = ev.code; go('/card/' + c.id); }
          } else if (action === 'price') {
            // Same as clicking the card's $ (prices.js): the focused card (A/D), else the one under the pointer.
            const t = focusedLi && focusedLi.isConnected ? null : targetCard();
            const li = focusedLi && focusedLi.isConnected ? focusedLi : t && t.root && t.root.closest('.ko-grid > li');
            if (li) { consume(ev); handled = ev.code; const b = li.querySelector(':scope > .kqp-btn'); if (b) b.click(); }
          }
          return;
        }
        const scene = find(document, SEL.scene);
        if (scene) {
          if (action === 'skip') {
            const b = find(scene, SEL.skip);
            if (b) { consume(ev); handled = ev.code; try { sessionStorage.setItem(SKIP_KEY + openingId(), '1'); } catch (e) { /* ignore */ } b.click(); }
          } else if (action === 'nextCard') {
            consume(ev); handled = ev.code;
            // Kosmora steps the reveal on ArrowRight (tear, then each card).
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true, cancelable: true }));
          }
          return;
        }
      }
    }

    // Navigation
    if (s.nav.enabled) {
      const dest = Object.keys(s.nav.keys).find((k) => s.nav.keys[k] === combo);
      if (dest && kq.NAV_PATHS[dest]) { consume(ev); handled = ev.code; go(kq.NAV_PATHS[dest]); }
    }
  }, true);

  // ---- key legend: bottom of pack pages, left of the cards-per-row pill ----
  let legend = null, legendSig = '';
  function renderLegend() {
    const s = S();
    const on = location.pathname === OPEN && s.legend !== false;
    if (!on) { if (legend) legend.hidden = true; return; }
    const albums = s.albums.enabled ? s.albums.list.filter((a) => a.key) : [];
    const pk = s.pack.enabled ? s.pack.keys : {};
    const sig = JSON.stringify([albums, pk, s.albums.enabled]);
    if (!legend) {
      legend = document.createElement('div');
      legend.id = 'kq-legend';
      legend.title = 'Point at a card and press an album key. Click to change keys.';
      legend.addEventListener('click', () => kq.openDialog());
      document.body.appendChild(legend);
    }
    if (!legend.isConnected) document.body.appendChild(legend);
    legend.hidden = false;
    if (sig === legendSig) return;
    legendSig = sig;
    legend.textContent = '';
    const add = (key, label, cls) => {
      const sp = document.createElement('span');
      sp.className = 'kq-lg' + (cls ? ' ' + cls : '');
      const k = document.createElement('kbd'); k.textContent = kq.pretty(key);
      sp.append(k, document.createTextNode(' ' + label));
      legend.appendChild(sp);
    };
    if (albums.length) albums.forEach((a) => add(a.key, a.name, 'kq-lg-album'));
    else if (s.albums.enabled) {   // album keys turned off on purpose: no setup prompt
      const sp = document.createElement('span');
      sp.className = 'kq-lg kq-lg-setup';
      sp.textContent = '+ Set up album keys';
      legend.appendChild(sp);
    }
    if (pk.nextCard) add(pk.nextCard, 'next', 'kq-lg-pack');
    if (pk.skip) add(pk.skip, 'skip', 'kq-lg-pack');
    if (pk.nextPack) add(pk.nextPack, 'next pack', 'kq-lg-pack');
    if (pk.price) add(pk.price, 'price', 'kq-lg-pack');
  }
  kq.onChange(() => { legendSig = ''; renderLegend(); });

  // Reset summary focus on page changes.
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) { lastHref = location.href; focusedLi?.classList.remove('kq-focus'); focusedLi = null; }
    renderLegend();
  }, 500);
  renderLegend();
})();
