// Kosmora "Pulls" panel (Nov 17, 2026). Display-only, makes no requests.
// Replaces the old Quest pulls panel. Lists every card the price chips (prices.js) priced in this
// browser session, priciest first, above a minimum price the player picks. Quest cards (from
// content.js) carry a coloured quest mark and always show, whatever the minimum, so a cheap
// "keep, lights when followed" card can't be filtered away. Click a row to scroll to the card.
(() => {
  if (window.__kqPanel) return;
  window.__kqPanel = true;

  const LIST_KEY = 'kqp.pulls';       // sessionStorage: this browser session's pulls
  const MIN_KEY = 'kqp.min';          // localStorage: the minimum, kept across sessions
  const COLLAPSED_KEY = 'kqp.collapsed';
  const MINS = [0, 50, 100, 250, 500, 1000];
  const MAX_ROWS = 200;

  const store = {
    get(s, k, d) { try { const v = s.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(s, k, v) { try { s.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };

  let rows = store.get(sessionStorage, LIST_KEY, {});   // key -> row
  // Rows saved by older versions: the map key is the row's key (0.6.1 stored a shiny row under "<id>"
  // with key "<id>:veil"; trusting row.key left that row unpickable).
  for (const k of Object.keys(rows)) { rows[k].key = k; rows[k].id = String(rows[k].id || k.split(':')[0]); }
  let min = store.get(localStorage, MIN_KEY, 100);
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const QUEST_TEXT = { lights: 'lights a star', lit: 'star lit, sale stock', keep: 'keep, lights when followed', dead: 'gift copy, never counts' };

  function save() {
    const ids = Object.keys(rows);
    if (ids.length > MAX_ROWS) {
      ids.sort((a, b) => rows[a].at - rows[b].at).slice(0, ids.length - MAX_ROWS).forEach((id) => delete rows[id]);
    }
    store.set(sessionStorage, LIST_KEY, rows);
  }

  // Which pack opening (or page) a pull was seen on. A recap of the same opening has the same id.
  const ctx = () => (location.pathname === '/packs/open' && new URLSearchParams(location.search).get('id')) || location.pathname;

  // 0.6.13: removed rows. The price chips announce a card again every time its summary is drawn
  // (from the cache), so a removed row would come straight back on Back or a recap. Remember where
  // each removed row was seen and ignore it there; the same card from a different pack comes back.
  const HIDDEN_KEY = 'kqp.hidden';
  const hidden = store.get(sessionStorage, HIDDEN_KEY, {});   // key -> ctx it was removed from
  function remove(keys) {
    for (const k of keys) {
      if (!rows[k]) continue;
      hidden[k] = rows[k].ctx || '';
      delete rows[k];
      picked.delete(k);
    }
    const hk = Object.keys(hidden);
    if (hk.length > 400) hk.slice(0, hk.length - 400).forEach((k) => delete hidden[k]);
    store.set(sessionStorage, HIDDEN_KEY, hidden);
    savePicked(); save(); render();
  }
  function isHidden(key) {
    if (!(key in hidden)) return false;
    if (hidden[key] === ctx()) return true;
    delete hidden[key];   // seen in another pack: a new pull, show it again
    store.set(sessionStorage, HIDDEN_KEY, hidden);
    return false;
  }

  // Rows are keyed like the price chips: "<id>" for plain, "<id>:veil" for shiny, so a plain and
  // a shiny copy of the same card get their own rows. row.id is always the card id.
  function upsert(key, patch) {
    const r = rows[key] || { key, id: String(key).split(':')[0], at: Date.now(), ctx: ctx() };
    Object.assign(r, patch);
    rows[key] = r;
    save();
    schedule();
  }

  window.addEventListener('kqp-price', (ev) => {
    const d = ev.detail; if (!d || !d.id) return;
    const key = d.key || d.id;
    if (isHidden(key)) return;
    const plain = rows[d.id];
    upsert(key, { name: d.name || (rows[key] && rows[key].name) || 'card ' + d.id, rarity: d.rarity, finish: d.finish,
      median: d.median, last: d.last, count: d.count, priced: true,
      ...(key !== d.id && plain && plain.quest ? { quest: plain.quest, kind: plain.kind } : {}) });
  });
  window.addEventListener('kqs-pull', (ev) => {
    const d = ev.detail; if (!d || !d.id) return;
    const key = d.key || d.id;   // "<id>:veil" for a shiny copy, like the price rows
    if (isHidden(key)) return;
    const was = rows[key];
    upsert(key, { name: (was && was.name) || d.name, quest: d.quest, kind: d.kind });
    if (!was || !was.quest) expand();
  });
  let panel = null;
  function build() {
    panel = document.createElement('aside');
    panel.id = 'kqs-panel';
    panel.innerHTML =
      '<header title="Click to collapse or expand"><span class="kqp-title"></span>' +
      '<label class="kqp-min" title="Hide cards whose median is below this (quest cards always show)">min <select></select></label>' +
      '<button type="button" class="kqp-pick" title="Pick cards to sell together">Select</button>' +
      '<button type="button" class="kqp-gear" title="KosLess settings (Shift+/)" aria-label="Settings">⚙</button>' +
      '<button type="button" class="kqp-clear" title="Clear the whole list (your cards are not touched)" aria-label="Clear pulls">×</button></header><ul></ul>' +
      '<footer class="kqp-sellbar"><button type="button" class="kqp-all">All shown</button><button type="button" class="kqp-none">None</button>' +
      '<span></span><button type="button" class="kqp-drop" title="Take the ticked cards off this list (your cards are not touched)">Remove</button>' +
      '<button type="button" class="kqp-sell">Sell 0</button></footer>';
    const sel = panel.querySelector('select');
    for (const m of MINS) {
      const o = document.createElement('option');
      o.value = String(m); o.textContent = m ? fmt(m) : 'any';
      sel.appendChild(o);
    }
    sel.value = String(MINS.includes(min) ? min : 100);
    sel.addEventListener('click', (ev) => ev.stopPropagation());
    // blur after a change, or hotkeys stay off and letters/digits keep changing the minimum
    sel.addEventListener('change', () => { min = Number(sel.value); store.set(localStorage, MIN_KEY, min); sel.blur(); render(); });
    panel.querySelector('.kqp-clear').addEventListener('click', (ev) => {
      ev.stopPropagation(); remove(Object.keys(rows));
    });
    panel.querySelector('.kqp-drop').addEventListener('click', () => remove([...picked]));
    panel.querySelector('.kqp-gear').addEventListener('click', (ev) => { ev.stopPropagation(); window.__kq && window.__kq.openDialog(); });
    panel.querySelector('.kqp-pick').addEventListener('click', (ev) => {
      ev.stopPropagation(); picking = !picking; store.set(sessionStorage, PICKING_KEY, picking); expand(); render();
    });
    // All shown skips quest cards the badge says to keep (lights a star / keep until followed).
    panel.querySelector('.kqp-all').addEventListener('click', () => {
      shown().filter((r) => !(r.quest && (r.kind === 'keep' || r.kind === 'lights'))).forEach((r) => picked.add(r.key));
      savePicked(); render();
    });
    panel.querySelector('.kqp-none').addEventListener('click', () => { picked.clear(); savePicked(); render(); });
    panel.querySelector('.kqp-sell').addEventListener('click', () => {
      const ids = [...new Set([...picked].filter((k) => rows[k]).map((k) => rows[k].id))].slice(0, 60);
      if (!ids.length) return;
      // Mark them, and keep them ticked, so after listing them one Remove takes them off the list.
      for (const k of picked) if (rows[k]) rows[k].sent = true;
      save();
      // Kosmora's own batch sell page; it adds these to your saved sell draft (merging with
      // anything already there). Nothing is listed until you press its sell button.
      location.assign('/market/sell/batch?s=' + ids.join(','));
    });
    panel.querySelector('header').addEventListener('click', () => {
      const c = panel.classList.toggle('kqs-collapsed');
      store.set(sessionStorage, COLLAPSED_KEY, c);
    });
    if (store.get(sessionStorage, COLLAPSED_KEY, false)) panel.classList.add('kqs-collapsed');
    document.body.appendChild(panel);
  }

  // Bulk sell: checkbox mode
  const PICKING_KEY = 'kqp.picking', PICKED_KEY = 'kqp.picked';
  let picking = store.get(sessionStorage, PICKING_KEY, false);
  const picked = new Set(store.get(sessionStorage, PICKED_KEY, []));
  const savePicked = () => store.set(sessionStorage, PICKED_KEY, [...picked]);

  function expand() {
    if (panel) panel.classList.remove('kqs-collapsed');
    store.set(sessionStorage, COLLAPSED_KEY, false);
  }

  function shown() {
    return Object.values(rows)
      .filter((r) => r.quest || (r.priced && r.median >= min && (min === 0 || r.count > 0)))
      .sort((a, b) => (b.median || 0) - (a.median || 0) || b.at - a.at);
  }

  function render() {
    const list = shown();
    const all = Object.keys(rows).length;
    if (!all) { if (panel) { panel.remove(); panel = null; } return; }
    if (!panel || !panel.isConnected) build();
    panel.classList.toggle('kqp-picking', picking);
    panel.querySelector('.kqp-pick').textContent = picking ? 'Done' : 'Select';
    const n = new Set([...picked].filter((k) => rows[k]).map((k) => rows[k].id)).size;
    const sellBtn = panel.querySelector('.kqp-sell');
    sellBtn.textContent = 'Sell ' + Math.min(n, 60) + (n > 60 ? ' (max 60)' : '');
    sellBtn.disabled = !n;
    const dropBtn = panel.querySelector('.kqp-drop');
    const nDrop = [...picked].filter((k) => rows[k]).length;
    dropBtn.textContent = 'Remove' + (nDrop ? ' ' + nDrop : '');
    dropBtn.disabled = !nDrop;
    sellBtn.title = n ? 'Open Kosmora\'s Sell several cards page with these ' + Math.min(n, 60) + ' cards (adds them to your sell draft; you still set prices and confirm there)' : 'Tick some cards first';
    // The batch link takes card ids only, so Kosmora picks which copy goes in. Say so when it matters.
    const pickedRows = [...picked].map((k) => rows[k]).filter(Boolean);
    const shinyPicked = pickedRows.some((r) => r.finish === 'veil');
    const note = panel.querySelector('.kqp-sellbar > span');
    note.textContent = shinyPicked ? '✦ check the copy' : '';
    note.title = shinyPicked ? 'The sell page is opened by card, not by copy: Kosmora decides whether the plain or the shiny copy goes in. Check it there before setting the price.' : '';
    panel.querySelector('.kqp-title').textContent = 'Pulls ' + list.length + (list.length < all ? ' of ' + all : '');
    const ul = panel.querySelector('ul');
    ul.innerHTML = '';
    if (!list.length) {
      const li = document.createElement('li');
      li.className = 'kqp-empty';
      li.textContent = 'Nothing at ' + fmt(min) + '+ yet.';
      ul.appendChild(li);
      return;
    }
    for (const r of list) {
      const li = document.createElement('li');
      const top = document.createElement('div');
      top.className = 'kqp-row';
      const dot = document.createElement('span');
      dot.className = 'kqp-rar kqp-rar-' + (r.rarity || 'x');
      dot.title = r.rarity || '';
      // The name links to the card's page (sales, listings); the rest of the row scrolls to it.
      const name = document.createElement('a');
      name.className = 'kqp-name';
      name.href = '/card/' + r.id;
      name.title = 'Open ' + r.name + '\'s card page (Ctrl/middle-click: new tab)';
      name.textContent = r.name + (r.finish === 'veil' ? ' ✦' : '');
      name.addEventListener('click', (ev) => ev.stopPropagation());
      const price = document.createElement('span');
      price.className = 'kqp-price';
      price.textContent = !r.priced ? '…' : r.count ? fmt(r.median) + (r.last && r.last !== r.median ? ' · ' + fmt(r.last) : '') : 'no sales';
      price.title = r.priced ? (r.count ? 'median ' + fmt(r.median) + ', last sale ' + fmt(r.last) + ', ' + r.count + (r.count >= 20 ? '+' : '') + ' sales in 30 days' : 'no sales in 30 days') : 'not priced yet';
      if (picking) {
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.className = 'kqp-cb'; cb.checked = picked.has(r.key);
        cb.addEventListener('click', (ev) => ev.stopPropagation());
        cb.addEventListener('change', () => { if (cb.checked) picked.add(r.key); else picked.delete(r.key); savePicked(); render(); });
        top.append(cb);
      }
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'kqp-del'; del.textContent = '×';
      del.title = 'Take ' + r.name + ' off this list (the card is not touched)';
      del.setAttribute('aria-label', del.title);
      del.addEventListener('click', (ev) => { ev.stopPropagation(); remove([r.key]); });
      top.append(dot, name, price, del);
      li.appendChild(top);
      if (r.quest) {
        const q = document.createElement('small');
        q.className = 'kqp-quest kqs-' + (r.kind || 'keep');
        q.textContent = r.quest + ' · ' + (QUEST_TEXT[r.kind] || 'quest card');
        li.appendChild(q);
      }
      if (r.sent) {
        const s = document.createElement('small');
        s.className = 'kqp-sent';
        s.textContent = 'sent to Sell';
        s.title = 'You opened the sell page with this card. Listed it? Remove it here.';
        li.appendChild(s);
      }
      li.addEventListener('click', () => {
        const card = document.querySelector('li[data-kqp="' + CSS.escape(r.key) + '"]');
        if (!card) return;
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('kqp-flash');
        setTimeout(() => card.classList.remove('kqp-flash'), 1600);
      });
      ul.appendChild(li);
    }
  }

  let pending = 0;
  function schedule() {
    if (pending) return;
    pending = setTimeout(() => { pending = 0; try { render(); } catch (e) { console.warn('[pulls-panel]', e); } }, 150);
  }

  // The page may rebuild <body> children on navigation; put the panel back if it goes.
  new MutationObserver(() => { if (panel && !panel.isConnected) schedule(); }).observe(document.documentElement, { childList: true, subtree: false });
  setInterval(() => { if (panel && !panel.isConnected) schedule(); }, 2000);
  // 0.6.10: after "Sell N" the batch page sits at /market/sell/batch?s=<ids>, and Kosmora keeps
  // re-adding those ids to the saved draft while they're in the address, so Clear draft looked
  // broken. Once the linked cards show on the page (the draft has them), drop ?s= from the address
  // without a reload; the draft stays saved and Clear draft works again.
  let stripTries = 0;
  setInterval(() => {
    if (location.pathname !== '/market/sell/batch' || !/[?&]s=/.test(location.search)) { stripTries = 0; return; }
    const ids = (new URLSearchParams(location.search).get('s') || '').split(',').filter(Boolean);
    const shown = [...document.querySelectorAll('img')].some((im) => ids.some((id) => (im.currentSrc || im.src || '').includes('/media/cards/' + id + '/')));
    if (!shown) return;
    if (++stripTries < 3) return;   // let the page finish saving (about 1 s after the cards show)
    const u = new URL(location.href);
    u.searchParams.delete('s');
    history.replaceState(history.state, '', u.pathname + (u.search || '') + u.hash);
  }, 400);
  // 0.6.9: hidden on Nadir pages, where it sat over the game's End turn button and Auto switch.
  setInterval(() => { if (panel) panel.style.display = location.pathname.startsWith('/nadir') ? 'none' : ''; }, 300);
  render();
})();
