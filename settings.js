// KosLess settings (Nov 17, 2026): shared by keys.js, sell.js and panel.js (same content-
// script world, so they read window.__kq). Saved in chrome.storage.local. Key defaults follow a
// KosMore-style layout; there are no album shortcuts until you add albums or import a KosMore
// backup (Settings -> Import KosMore backup), and auto-skip / auto-dismiss start off.
// Open the settings dialog from the toolbar button, the gear in the Pulls panel, or Shift+/ .
(() => {
  if (window.__kq) return;

  const DEFAULTS = {
    nav: {
      enabled: true,
      keys: {
        home: 'Shift+KeyH', collection: 'Shift+KeyC', albums: 'Shift+KeyA', fusion: 'Shift+KeyF',
        market: 'Shift+KeyM', myAuctions: 'Shift+KeyL', odyssey: 'Shift+KeyO', packs: 'Shift+KeyP',
        pulsar: 'Shift+KeyG', quests: 'Shift+KeyQ', social: 'Shift+KeyS', talents: 'Shift+KeyT',
        tomes: '', families: '', gallery: '', atlas: '', myActivity: '', history: '',
      },
    },
    pack: {
      enabled: true,
      keys: { nextCard: 'KeyD', previousCard: 'KeyA', skip: 'KeyS', nextPack: 'KeyE', upRow: 'KeyW', downRow: 'KeyS', seeCard: 'KeyF', firstCard: 'Home', lastCard: 'End', price: 'KeyQ' },
      anyKeyDismiss: true,
      autoSkip: false,
      autoDismiss: false,
    },
    legend: true,   // key legend at the bottom of pack pages
    // 0.7.0: which summary cards get priced without a click (prices.js): all, uncommon, rare, epic
    // (that rarity and up) or none. Quest cards always are.
    prices: { auto: 'all' },
    albums: {
      enabled: true,
      list: [],   // { id, name, key }
    },
    sell: {
      enabled: true,
      quick: [50, 100, 150, 250, 500, 1000],
      minimums: { Common: 20, Uncommon: 20, Rare: 45, Epic: 45, Legendary: 100, Mythic: 500 },
      lastSale: true, lastSaleAdj: 0,
      lowest: true, lowestAdj: -1,
    },
  };

  const NAV_PATHS = {
    home: '/home', collection: '/collection', albums: '/albums', fusion: '/fusion', market: '/market',
    myAuctions: '/market?tab=overview&view=auctions', odyssey: '/odyssey', packs: '/packs', pulsar: '/games',
    quests: '/quests', social: '/social', talents: '/talents', tomes: '/tomes', families: '/families',
    gallery: '/gallery', atlas: '/atlas', myActivity: '/market?tab=overview&view=mine', history: '/history',
  };
  const NAV_LABELS = {
    home: 'Home', collection: 'Collection', albums: 'Albums', fusion: 'Fusion', market: 'Market', myAuctions: 'My Auctions',
    odyssey: 'Odyssey', packs: 'Packs', pulsar: 'Pulsar', quests: 'Quests', social: 'Social', talents: 'Talents',
    tomes: 'Tomes', families: 'Families', gallery: 'Gallery', atlas: 'Atlas', myActivity: 'My Activity', history: 'History',
  };
  const PACK_LABELS = {
    nextCard: 'Next card (tear / reveal / next on summary)', previousCard: 'Previous card (summary)', upRow: 'Row up (summary)', downRow: 'Row down (summary)', skip: 'Skip opening',
    nextPack: 'Next pack', seeCard: 'Open focused card', firstCard: 'First card (summary)', lastCard: 'Last card (summary)', price: 'Price of the focused card (summary, same as its $)',
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));
  function merge(base, over) {
    if (Array.isArray(base) || typeof base !== 'object' || base === null) return over === undefined ? base : over;
    const out = {};
    for (const k of new Set([...Object.keys(base), ...Object.keys(over || {})])) out[k] = merge(base[k], over ? over[k] : undefined);
    return out;
  }

  let current = clone(DEFAULTS);
  const listeners = [];
  const STORE_KEY = 'kqSettings';

  // 0.6.8: W/S move between rows on the summary. Settings saved before that (or a KosMore import)
  // have 'open card' on W, which would clash: it moves to F (or off, if F is taken).
  function fixKeys(c) {
    const k = c.pack && c.pack.keys;
    if (k && k.seeCard && (k.seeCard === k.upRow || k.seeCard === k.downRow)) {
      k.seeCard = Object.entries(k).some(([a, v]) => a !== 'seeCard' && v === 'KeyF') ? '' : 'KeyF';
    }
    return c;
  }

  function load() {
    try {
      chrome.storage.local.get(STORE_KEY, (r) => {
        if (chrome.runtime.lastError) return;
        current = fixKeys(merge(DEFAULTS, (r && r[STORE_KEY]) || {}));
        listeners.forEach((f) => { try { f(current); } catch (e) { /* ignore */ } });
      });
      chrome.storage.onChanged.addListener((ch, area) => {
        if (area !== 'local' || !ch[STORE_KEY]) return;
        current = fixKeys(merge(DEFAULTS, ch[STORE_KEY].newValue || {}));
        listeners.forEach((f) => { try { f(current); } catch (e) { /* ignore */ } });
      });
    } catch (e) { /* storage unavailable: defaults */ }
  }

  function save(next) {
    current = fixKeys(merge(DEFAULTS, next));
    try { chrome.storage.local.set({ [STORE_KEY]: current }); } catch (e) { /* ignore */ }
  }

  // "Shift+KeyH" <-> KeyboardEvent
  function comboOf(ev) {
    if (['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock'].includes(ev.key)) return '';
    return (ev.ctrlKey ? 'Ctrl+' : '') + (ev.altKey ? 'Alt+' : '') + (ev.shiftKey ? 'Shift+' : '') + (ev.metaKey ? 'Meta+' : '') + ev.code;
  }
  const pretty = (c) => (c || '').replace(/Key([A-Z])/, '$1').replace(/Digit(\d)/, '$1');

  // Text-like fields only: a focused checkbox, button or range shouldn't switch hotkeys off.
  const TEXTY = /^(text|search|number|email|password|url|tel|date|datetime-local|month|time|week)$/i;
  function typing(t) {
    if (!t || !t.tagName) return false;
    if (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
    return t.tagName === 'INPUT' && TEXTY.test(t.type || 'text');
  }

  // Small toast at the top centre.
  function toast(text, kind) {
    let box = document.getElementById('kq-toasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'kq-toasts';
      document.body.appendChild(box);
    }
    const t = document.createElement('div');
    t.className = 'kq-toast' + (kind ? ' kq-toast-' + kind : '');
    t.textContent = text;
    box.appendChild(t);
    setTimeout(() => t.remove(), kind === 'err' ? 5000 : 2600);
  }

  // ---- settings dialog ----
  function openDialog() {
    document.getElementById('kq-settings')?.remove();
    const s = clone(current);
    const d = document.createElement('div');
    d.id = 'kq-settings';
    d.innerHTML = `<div class="kq-dlg" role="dialog" aria-label="KosLess settings">
      <header><b>KosLess settings</b><button type="button" class="kq-x" aria-label="Close">×</button></header>
      <div class="kq-body">
        <section class="kq-import"><p class="kq-hint">Coming from KosMore? Export a backup there (Backup &amp; restore → Export backup), then import it here to bring over your album shortcuts, hotkeys, quick prices and minimums.</p>
          <div><button type="button" class="kq-import-btn">Import KosMore backup…</button><input type="file" accept=".json,application/json" hidden><span class="kq-import-msg"></span></div></section>
        <section><h4><label><input type="checkbox" data-k="albums.enabled"> Album hotkeys</label></h4>
          <p class="kq-hint">Point at a card (or step to one on a pack summary) and press the key to add it to that album.</p>
          <label><input type="checkbox" data-k="legend"> Show the keys at the bottom of pack pages</label>
          <div class="kq-albums"></div>
          <button type="button" class="kq-load-albums">Load my albums</button></section>
        <section><h4><label><input type="checkbox" data-k="pack.enabled"> Pack opening</label></h4>
          <div class="kq-grid" data-group="pack"></div>
          <label><input type="checkbox" data-k="pack.anyKeyDismiss"> Any key dismisses a found-pack popup</label>
          <label><input type="checkbox" data-k="pack.autoDismiss"> Auto-dismiss Rogue/Mega found-pack popups</label>
          <label><input type="checkbox" data-k="pack.autoSkip"> Auto-skip the next pack's opening (after Next pack; needs Kosmora's reveal hints on)</label></section>
        <section><h4>Price chips</h4>
          <label>Auto-price on pack summaries <select data-s="prices.auto">
            <option value="all">Every card</option><option value="uncommon">Uncommon and up</option>
            <option value="rare">Rare and up</option><option value="epic">Epic and up</option>
            <option value="none">None (only $ and Q)</option></select></label>
          <p class="kq-hint">Quest cards are always priced. Reads stay under Kosmora's limit of 120 a minute, so opening packs fast with "Every card" just makes the prices arrive later; cards below the level get a $ to price them one at a time.</p></section>
        <section><h4><label><input type="checkbox" data-k="nav.enabled"> Navigation</label></h4>
          <div class="kq-grid" data-group="nav"></div></section>
        <section><h4><label><input type="checkbox" data-k="sell.enabled"> Sell page</label></h4>
          <label>Quick prices <input type="text" class="kq-quick"></label>
          <div class="kq-mins"></div>
          <label><input type="checkbox" data-k="sell.lastSale"> Last sale (click to fill, adjust <input type="number" step="1" data-n="sell.lastSaleAdj">)</label>
          <label><input type="checkbox" data-k="sell.lowest"> Lowest listed (click to fill, adjust <input type="number" step="1" data-n="sell.lowestAdj">)</label></section>
      </div>
      <footer><button type="button" class="kq-reset">Defaults</button><span></span><button type="button" class="kq-cancel">Cancel</button><button type="button" class="kq-save">Save</button></footer>
    </div>`;
    const get = (path) => path.split('.').reduce((o, k) => o && o[k], s);
    const set = (path, v) => { const ks = path.split('.'); const last = ks.pop(); ks.reduce((o, k) => o[k], s)[last] = v; };

    let capture = null;   // the key box waiting for a key press, if any
    const stopCapture = () => { if (capture) { window.removeEventListener('keydown', capture.on, true); capture.show(); capture = null; } };
    function keyButton(path) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'kq-key';
      const show = () => { b.textContent = pretty(get(path)) || '—'; };
      show();
      b.addEventListener('click', () => {
        stopCapture();
        b.textContent = 'press a key…';
        const on = (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          if (ev.key === 'Escape') { stopCapture(); return; }
          if (ev.key === 'Backspace' || ev.key === 'Delete') { set(path, ''); stopCapture(); return; }
          const c = comboOf(ev);
          if (!c) return;
          set(path, c); stopCapture();
        };
        capture = { on, show };
        window.addEventListener('keydown', on, true);
      });
      return b;
    }
    function grid(group, labels) {
      const g = d.querySelector(`.kq-grid[data-group="${group}"]`);
      for (const k of Object.keys(labels)) {
        const row = document.createElement('div');
        const l = document.createElement('span');
        l.textContent = labels[k];
        row.append(l, keyButton(group + '.keys.' + k));
        g.appendChild(row);
      }
    }
    grid('pack', PACK_LABELS);
    grid('nav', NAV_LABELS);

    function albumRows() {
      const box = d.querySelector('.kq-albums');
      box.innerHTML = '';
      if (!s.albums.list.length) {
        const p = document.createElement('p');
        p.className = 'kq-hint';
        p.textContent = 'No album shortcuts yet. Load your albums below and pick one, then click its key box and press a key.';
        box.appendChild(p);
      }
      s.albums.list.forEach((a, i) => {
        const row = document.createElement('div');
        const name = document.createElement('span');
        name.textContent = a.name;
        const rm = document.createElement('button');
        rm.type = 'button'; rm.textContent = '✕'; rm.title = 'Remove this shortcut';
        rm.addEventListener('click', () => { s.albums.list.splice(i, 1); albumRows(); });
        row.append(name, keyButton('albums.list.' + i + '.key'), rm);
        box.appendChild(row);
      });
    }
    albumRows();
    d.querySelector('.kq-load-albums').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      btn.disabled = true; btn.textContent = 'Loading…';
      try {
        const r = await fetch('/api/albums', { credentials: 'include' });
        const j = await r.json();
        const all = j.albums || j || [];
        const sel = document.createElement('select');
        const first = document.createElement('option'); first.value = ''; first.textContent = 'Add an album…'; sel.appendChild(first);
        for (const a of all) { const o = document.createElement('option'); o.value = a.id; o.textContent = a.name + ' (' + (a.items ?? '?') + ')'; sel.appendChild(o); }
        sel.addEventListener('change', () => {
          const a = all.find((x) => x.id === sel.value);
          if (a && !s.albums.list.some((x) => x.id === a.id)) { s.albums.list.push({ id: a.id, name: a.name, key: '' }); albumRows(); }
          sel.value = '';
        });
        btn.replaceWith(sel);
      } catch (e) { btn.disabled = false; btn.textContent = 'Load my albums (failed, retry)'; }
    });

    const mins = d.querySelector('.kq-mins');
    for (const r of ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic']) {
      const l = document.createElement('label');
      l.innerHTML = `${r} min <input type="number" min="0" step="1" data-n="sell.minimums.${r}">`;
      mins.appendChild(l);
    }
    d.querySelector('.kq-quick').value = s.sell.quick.join(', ');
    d.querySelectorAll('[data-k]').forEach((i) => { i.checked = !!get(i.dataset.k); });
    d.querySelectorAll('[data-n]').forEach((i) => { i.value = get(i.dataset.n); });
    d.querySelectorAll('[data-s]').forEach((i) => { i.value = get(i.dataset.s); });

    const file = d.querySelector('.kq-import input[type=file]');
    const msg = d.querySelector('.kq-import-msg');
    d.querySelector('.kq-import-btn').addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      msg.textContent = ' Reading…';
      try {
        const backup = JSON.parse(await f.text());
        // Album names and your handle: 2 reads, so imported shortcuts show real names.
        let albums = [], handle = '';
        try { const r = await fetch('/api/albums', { credentials: 'include' }); if (r.ok) { const j = await r.json(); albums = j.albums || j || []; } } catch (e) { /* names stay placeholders */ }
        try { const r = await fetch('/api/me', { credentials: 'include' }); if (r.ok) { const j = await r.json(); handle = j.handle || j.username || (j.user && j.user.handle) || ''; } } catch (e) { /* first account */ }
        const { patch, summary } = globalThis.kqFromKosMore(backup, albums, handle);
        save(merge(current, patch));
        d.remove();
        openDialog();
        const m2 = document.querySelector('#kq-settings .kq-import-msg');
        if (m2) m2.textContent = ' ' + summary + ' Saved.';
        toast(summary, 'ok');
      } catch (e) {
        msg.textContent = ' ' + (e.message || e);
      }
      file.value = '';
    });

    const close = () => { stopCapture(); d.remove(); };
    d.querySelector('.kq-x').addEventListener('click', close);
    d.querySelector('.kq-cancel').addEventListener('click', close);
    d.addEventListener('click', (ev) => { if (ev.target === d) close(); });
    d.querySelector('.kq-reset').addEventListener('click', () => {
      if (!confirm('Reset every setting, including your album shortcuts, to the defaults?')) return;
      save(clone(DEFAULTS)); close(); toast('Settings reset to defaults');
    });
    d.querySelector('.kq-save').addEventListener('click', () => {
      d.querySelectorAll('[data-k]').forEach((i) => set(i.dataset.k, i.checked));
      d.querySelectorAll('[data-n]').forEach((i) => set(i.dataset.n, Number(i.value) || 0));
      d.querySelectorAll('[data-s]').forEach((i) => set(i.dataset.s, i.value));
      s.sell.quick = d.querySelector('.kq-quick').value.split(/[^\d.]+/).map(Number).filter((n) => n > 0).slice(0, 10);
      stopCapture(); save(s); close(); toast('Settings saved');
    });
    document.body.appendChild(d);
  }

  window.__kq = {
    get settings() { return current; },
    onChange(f) { listeners.push(f); },
    comboOf, pretty, typing, toast, openDialog, NAV_PATHS,
  };

  try {
    chrome.runtime.onMessage.addListener((msg) => { if (msg && msg.type === 'kq-open-settings') openDialog(); });
  } catch (e) { /* ignore */ }
  addEventListener('keydown', (ev) => {
    if (ev.code === 'Slash' && ev.shiftKey && !ev.ctrlKey && !ev.altKey && !typing(ev.target) && !document.getElementById('kq-settings')) { ev.preventDefault(); openDialog(); }
  }, true);
  load();
})();
