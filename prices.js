// Kosmora price chips on pack summaries (Nov 17, 2026). Display-only: reads sale history, never
// bids, lists or clicks anything on the page.
//
// Which cards (0.7.0): the settings' "Auto-price" level (every card by default; or Uncommon, Rare
// or Epic and up; or none), plus quest cards (KosLess's badge) always. A card below the level
// gets a small "$" button that reads that one card when clicked (or Q on the focused card).
// Order: $ / Q / sell-page lookups first, then Epic+ and quest cards, then Rare, Uncommon, Common.
// The queue keeps running after you leave the summary; the Pulls panel fills in as reads land.
// How: one request per card (/api/cards/<id>/prices, the same call the card page makes), one at a
// time. Pacing follows Kosmora's measured limit (Nov 18, 2026: 120 price reads per 60 s, counted
// per clock minute with the previous minute weighted down as the current one passes): we stay at or
// under BUDGET of those 120, by the server's clock (from its Date header). A 429 (someone else's
// reads, or a changed limit) pauses for exactly the server's Retry-After.
(() => {
  if (window.__kqpLoaded) return;
  window.__kqpLoaded = true;

  const RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
  const AUTO_MIN = { all: 0, uncommon: 1, rare: 2, epic: 3, none: null };
  const BUDGET = 110;                // of Kosmora's 120 price reads a minute (measured Nov 18)
  const MIN_GAP = 150;               // ms between reads; they're one at a time anyway (~120 ms each)
  const CACHE_KEY = 'kqp.cache';
  const CACHE_TTL = 6 * 60 * 60 * 1000;   // 6 h, shared by tabs (0.6.5)

  // Shared by every Kosmora tab (localStorage, since 0.6.4): the price cache, the time of the last
  // read, any 429 pause, and (0.7.0) this minute's and last minute's read counts plus the offset
  // to the server's clock.
  const PACE_KEY = 'kqp.pace';       // { lastAt, pausedUntil, win: { m, cur, prev }, off }
  const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (e) { return {}; } };
  const pace = () => readJSON(PACE_KEY);
  const setPace = (patch) => { try { localStorage.setItem(PACE_KEY, JSON.stringify({ ...pace(), ...patch })); } catch (e) { /* ignore */ } };

  let cache = readJSON(CACHE_KEY);
  const saveCache = () => {
    const shared = readJSON(CACHE_KEY);   // another tab may have added cards meanwhile; newest entry wins
    for (const [k, v] of Object.entries(shared)) if (!cache[k] || cache[k].at < v.at) cache[k] = v;
    const keys = Object.keys(cache);
    // 2,000 cards (~1 MB) since 0.7.0, when every card started being read; 300 before.
    if (keys.length > 2000) keys.sort((a, b) => cache[a].at - cache[b].at).slice(0, keys.length - 2000).forEach((k) => delete cache[k]);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* ignore */ }
  };
  try { sessionStorage.removeItem(CACHE_KEY); } catch (e) { /* the 0.6.3 per-tab cache */ }

  const queue = [];                  // { key, id, finish, prio, ... }, lowest prio first
  const waiting = new Map();         // key -> [li or callback]
  let busy = false;
  let lastAt = 0;
  let pausedUntil = 0;

  const diag = (d) => { try { window.dispatchEvent(new CustomEvent('kqp-diag', { detail: d })); } catch (e) { /* ignore */ } };

  // ---- Kosmora's price-read limit, as measured Nov 18, 2026 ----
  // Estimated count = last minute's reads × (share of this minute still to go) + this minute's reads.
  const serverNow = (sh) => Date.now() + (sh.off || 0);
  function counts(sh, t) {
    const w = sh.win || {};
    let m = Math.floor(t / 60000), f = (t % 60000) / 60000;
    // Never step back into a minute we've already left: a clock estimate a little behind near the
    // boundary would otherwise wipe the count (seen in test/pace-test.html, Nov 18).
    if (w.m > m) { m = w.m; f = 0; }
    return {
      m, f,
      cur: w.m === m ? (w.cur || 0) : 0,
      prev: w.m === m ? (w.prev || 0) : (w.m === m - 1 ? (w.cur || 0) : 0),
    };
  }
  // Server clock offset from a response's Date header (whole seconds). It bounds the offset:
  // at least Date − received, below Date + 1 s − sent. Bounds from every read are intersected, so
  // the estimate tightens instead of jumping ±0.5 s per read. Reset after an hour or if they clash.
  function learnClock(dateHeader, sentAt, recvAt) {
    const sd = Date.parse(dateHeader || '');
    if (!sd) return;
    const p = pace();
    let lo = sd - recvAt, hi = sd + 1000 - sentAt, at = recvAt;
    if (p.offLo != null && p.offHi != null && recvAt - (p.offAt || 0) < 3600000) {
      const L = Math.max(lo, p.offLo), H = Math.min(hi, p.offHi);
      if (L <= H) { lo = L; hi = H; at = p.offAt; }
    }
    setPace({ offLo: lo, offHi: hi, offAt: at, off: Math.round((lo + hi) / 2) });
  }
  // ms until one more read fits under BUDGET (0 = now).
  function budgetWait(sh) {
    const t = serverNow(sh);
    const { cur, prev, f } = counts(sh, t);
    if (prev * (1 - f) + cur + 1 <= BUDGET) return 0;
    if (cur + 1 > BUDGET || !prev) return 60000 - (t % 60000) + 50;   // next minute, then check again
    return Math.max(50, Math.ceil((1 - (BUDGET - 1 - cur) / prev - f) * 60000) + 50);
  }
  function spend(sh) { const c = counts(sh, serverNow(sh)); return { m: c.m, cur: c.cur + 1, prev: c.prev }; }

  // Auto-price level from the settings (settings.js, window.__kq): null = none.
  function autoMin() {
    const v = window.__kq && window.__kq.settings && window.__kq.settings.prices && window.__kq.settings.prices.auto;
    return Object.prototype.hasOwnProperty.call(AUTO_MIN, v) ? AUTO_MIN[v] : 0;
  }
  const rankOf = (r) => RANK[r] ?? 0;
  // 0 = you asked ($, Q, sell page), 1 = Epic+ or quest, then Rare 2, Uncommon 3, Common 4.
  const prioOf = (rarity, quest) => (quest || rankOf(rarity) >= 3 ? 1 : 4 - rankOf(rarity));

  // front: ahead of jobs with the same priority (a retry after a 429), else behind them.
  function insert(job, front) {
    let i = queue.findIndex((j) => (front ? j.prio >= job.prio : j.prio > job.prio));
    if (i < 0) i = queue.length;
    queue.splice(i, 0, job);
  }
  function bump(key, prio) {
    const i = queue.findIndex((j) => j.key === key);
    if (i < 0 || queue[i].prio <= prio) return;
    const job = queue.splice(i, 1)[0];
    job.prio = prio;
    insert(job);
  }
  const kosmo = (s) => Math.round(Number(s || 0) / 1e6);
  const fmt = (n) => n.toLocaleString('en-US');

  function cardInfo(li) {
    const img = li.querySelector('img.kc-img');
    const src = img ? [img.currentSrc, img.getAttribute('src'), img.getAttribute('srcset')].filter(Boolean).join(' ') : '';
    const m = src.match(/\/media\/cards\/(\d+)\//);
    if (!m) return null;
    // Shiny copies have their own sales (plain sales exclude them). Full arts are read as plain.
    const finish = li.querySelector('.kc-veil') ? 'veil' : '';
    const fa = !!li.querySelector('.kc-fa');
    const name = (img && img.getAttribute('alt')) || '';
    return { id: m[1], finish, fa, name, rarity: (li.dataset.rarity || '').toLowerCase() };
  }

  // Tell the Pulls panel (panel.js) about a priced card.
  // li: the summary card being drawn, if any. A price first read on a sell page has no name or
  // rarity in the cache, so take them from the card on screen (0.6.14).
  function announce(key, hit, li) {
    const p = hit.p || {};
    const last = p.sales && p.sales[0];
    const info = li && (!hit.name || !hit.rarity) ? cardInfo(li) : null;
    try {
      window.dispatchEvent(new CustomEvent('kqp-price', { detail: {
        key, id: key.split(':')[0], name: hit.name || (info && info.name) || '', rarity: hit.rarity || (info && info.rarity) || '', finish: hit.finish || '',
        median: kosmo(p.median), last: last ? kosmo(last.price) : 0, count: p.count || 0,
      } }));
    } catch (e) { /* ignore */ }
  }

  function chipFor(li) {
    let c = li.querySelector(':scope > .kqp-chip');
    if (!c) {
      c = document.createElement('div');
      c.className = 'kqp-chip';
      li.appendChild(c);
    }
    return c;
  }

  function render(li, key) {
    const btn = li.querySelector(':scope > .kqp-btn');
    if (btn) btn.remove();
    const c = chipFor(li);
    const hit = cache[key];
    if (!hit || (hit.err && waiting.has(key))) {
      c.className = 'kqp-chip kqp-wait';
      c.textContent = Date.now() < pausedUntil ? 'paused' : '…';
      c.title = Date.now() < pausedUntil ? 'Rate limited; waiting before the next read.' : 'Queued for a price read.';
      return;
    }
    if (hit.err) {
      c.className = 'kqp-chip kqp-err';
      c.textContent = 'no data';
      c.title = 'Price read failed (' + hit.err + ').';
      return;
    }
    const p = hit.p;
    const fin = hit.finish === 'veil' ? 'shiny ' : '';
    announce(key, hit, li);
    if (!p.count) {
      c.className = 'kqp-chip kqp-none';
      c.textContent = 'no';   // 0.7.2: short, so it covers less of the card (tooltip has the detail)
      c.title = 'No ' + fin + 'sales in the last ' + (p.days || 30) + ' days.' + (hit.fa ? ' (Full art: plain sales shown.)' : '');
      return;
    }
    const last = p.sales && p.sales[0];
    c.className = 'kqp-chip kqp-ok';
    // sales[] is newest first. The median can hide a crash, so the last sale shows too.
    c.textContent = 'med ' + fmt(kosmo(p.median)) + (last ? ' · last ' + fmt(kosmo(last.price)) : '') + ' (' + p.count + (p.count >= 20 ? '+' : '') + ')';
    const lines = [
      (hit.name ? hit.name + ': ' : '') + fin + 'sales, last ' + (p.days || 30) + ' days' + (hit.fa ? ' (full art: plain sales shown)' : ''),
      'Median ' + fmt(kosmo(p.median)) + ', low ' + fmt(kosmo(p.low)) + ', high ' + fmt(kosmo(p.high)) + ', ' + p.count + ' sales',
    ];
    if (last) lines.push('Recent: ' + p.sales.slice(0, 4).map((s) => fmt(kosmo(s.price)) + ' (' + new Date(s.soldAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ')').join(', '));
    c.title = lines.join('\n');
  }

  const fresh = (key) => {
    const ok = (e) => e && !e.err && Date.now() - e.at < CACHE_TTL;
    if (!ok(cache[key])) { const s = readJSON(CACHE_KEY)[key]; if (ok(s)) cache[key] = s; }   // read in another tab?
    return ok(cache[key]);
  };

  function enqueue(li, info, key, prio) {
    if (fresh(key)) { render(li, key); return; }
    const list = waiting.get(key);
    if (list) { if (!list.includes(li)) list.push(li); bump(key, prio); render(li, key); return; }
    waiting.set(key, [li]);
    insert({ key, id: info.id, finish: info.finish, fa: info.fa, name: info.name, rarity: info.rarity, prio, quest: !!info.quest });
    render(li, key);
    pump();
  }

  // 0.6.12: the batch sell page (batch.js) and (0.7.0) the single sell page (sell.js) read cached
  // prices and ask for new ones through the same queue, at the front (it's the card you're looking at).
  window.__kqp = {
    get(id, finish) {
      const key = id + (finish ? ':' + finish : '');
      return fresh(key) ? cache[key] : null;
    },
    request(id, finish, cb) {
      const key = id + (finish ? ':' + finish : '');
      if (fresh(key)) { cb(cache[key]); return; }
      const list = waiting.get(key);
      if (list) { list.push(cb); bump(key, 0); return; }
      waiting.set(key, [cb]);
      // panel: false (0.6.14): a sell-page lookup isn't a pull, so it stays out of the Pulls panel.
      insert({ key, id, finish, fa: false, name: '', rarity: '', panel: false, prio: 0 });
      pump();
    },
    // Q on a summary card (keys.js): its $ if it has one, else move its queued read to the front.
    prioritize(li) {
      const b = li.querySelector(':scope > .kqp-btn');
      if (b) { b.click(); return; }
      if (li.dataset.kqp) bump(li.dataset.kqp, 0);
    },
    queued: () => queue.length,
  };

  function pump() {
    if (busy || !queue.length) return;
    const now = Date.now();
    const sh = pace();
    pausedUntil = Math.max(pausedUntil, sh.pausedUntil || 0);
    const last = Math.max(lastAt, sh.lastAt || 0);
    const wait = Math.max(pausedUntil - now, last + MIN_GAP - now, budgetWait(sh), 0);
    busy = true;
    setTimeout(run, wait);
  }

  async function run() {
    if (Date.now() < pausedUntil) { busy = false; pump(); return; }
    // Another tab may have read (or hit a 429) while this one waited: check the shared pace again.
    const sh = pace();
    if (Date.now() < (sh.pausedUntil || 0) || (sh.lastAt && Date.now() - sh.lastAt < MIN_GAP) || budgetWait(sh) > 0) { busy = false; pump(); return; }
    if (queue.length && fresh(queue[0].key)) {   // another tab read this card meanwhile
      const done = queue.shift();
      (waiting.get(done.key) || []).forEach((li) => { if (typeof li === 'function') { try { li(cache[done.key]); } catch (e) { /* ignore */ } } else if (li.isConnected) render(li, done.key); });
      waiting.delete(done.key);
      busy = false; pump(); return;
    }
    const job = queue.shift();
    if (!job) { busy = false; return; }
    lastAt = Date.now();
    const win = spend(sh);
    setPace({ lastAt, win });
    let entry;
    try {
      const r = await fetch('/api/cards/' + job.id + '/prices' + (job.finish ? '?finish=' + job.finish : ''), { credentials: 'include' });
      learnClock(r.headers.get('Date'), lastAt, Date.now());
      diag({ id: job.id, status: r.status, retryAfter: r.headers.get('Retry-After'), queued: queue.length, ms: Date.now() - lastAt, prio: job.prio, minute: win.cur, prevMinute: win.prev });
      if (r.status === 429) {
        const ra = parseInt(r.headers.get('Retry-After') || '', 10);
        pausedUntil = Date.now() + (isFinite(ra) ? ra * 1000 + 500 : 15000);
        setPace({ pausedUntil });   // every tab waits, not just this one
        insert(job, true);   // try this card again after the pause
        (waiting.get(job.key) || []).forEach((li) => { if (li instanceof Element) render(li, job.key); });
        busy = false; pump(); return;
      }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      // Keep only what the chips and panel use (the full sales list can fill sessionStorage).
      const pr = data.prices || data;
      const p = { count: pr.count, days: pr.days, median: pr.median, low: pr.low, high: pr.high, sales: (pr.sales || []).slice(0, 4) };
      entry = { at: Date.now(), p, finish: job.finish, fa: job.fa, name: job.name, rarity: job.rarity };
    } catch (e) {
      diag({ id: job.id, error: String(e.message || e) });
      entry = { at: Date.now(), err: String(e.message || e), finish: job.finish };
    }
    cache[job.key] = entry;
    saveCache();
    // Tell the panel even if the card is no longer on screen (you left the summary meanwhile).
    // Sell-page lookups (panel: false) don't; if a summary card was also waiting on this read, its
    // render below announces it with the card's own name.
    if (!entry.err && job.panel !== false) announce(job.key, entry);
    (waiting.get(job.key) || []).forEach((li) => {
      if (typeof li === 'function') { try { li(entry); } catch (e) { /* ignore */ } }
      else if (li.isConnected) render(li, job.key);
    });
    waiting.delete(job.key);
    busy = false;
    pump();
  }

  function addButton(li, info, key) {
    if (li.querySelector(':scope > .kqp-btn') || li.querySelector(':scope > .kqp-chip')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'kqp-btn';
    b.textContent = '$';
    b.title = 'Read this card\'s sale prices (one request)';
    b.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); enqueue(li, info, key); });
    li.appendChild(b);
  }

  function scan() {
    const lis = document.querySelectorAll('ul.ko-grid:not(.t3d-grid) > li');
    if (!lis.length) return;
    const min = autoMin();
    for (const li of lis) {
      if (li.dataset.kqp) {
        // Quest badges arrive after the quests list loads: an unread quest card is read (sooner).
        if (!li.dataset.kqpq && li.querySelector('[data-kqs]')) {
          li.dataset.kqpq = '1';
          const btn = li.querySelector(':scope > .kqp-btn');
          const info = btn && cardInfo(li);
          if (info) enqueue(li, { ...info, quest: true }, li.dataset.kqp, 1);
          else { const j = queue.find((x) => x.key === li.dataset.kqp); if (j) j.quest = true; bump(li.dataset.kqp, 1); }
        }
        continue;
      }
      const info = cardInfo(li);
      if (!info) continue;                       // picture not loaded yet; next scan picks it up
      const key = info.id + (info.finish ? ':' + info.finish : '');
      li.dataset.kqp = key;
      if (getComputedStyle(li).position === 'static') li.style.position = 'relative';
      const quest = !!li.querySelector('[data-kqs]');
      if (quest) li.dataset.kqpq = '1';
      if (fresh(key)) { render(li, key); continue; }
      if (quest || (min !== null && rankOf(info.rarity) >= min)) enqueue(li, { ...info, quest }, key, prioOf(info.rarity, quest));
      else addButton(li, info, key);
    }
  }

  // Auto-price level changed in the settings: drop queued reads it no longer covers (their cards
  // get a $ again) and queue the cards on screen it now covers.
  function reapply() {
    const min = autoMin();
    for (let i = queue.length - 1; i >= 0; i--) {
      const j = queue[i];
      if (j.prio === 0 || j.quest || (min !== null && rankOf(j.rarity) >= min)) continue;
      const list = waiting.get(j.key) || [];
      if (list.some((x) => typeof x === 'function')) continue;   // a sell page is waiting on it
      queue.splice(i, 1);
      waiting.delete(j.key);
      for (const li of list) {
        if (!li.isConnected) continue;
        li.querySelector(':scope > .kqp-chip')?.remove();
        const info = cardInfo(li);
        if (info) addButton(li, info, j.key);
      }
    }
    if (min === null) return;
    document.querySelectorAll('ul.ko-grid:not(.t3d-grid) > li > .kqp-btn').forEach((b) => {
      const li = b.parentElement;
      const info = cardInfo(li);
      if (info && li.dataset.kqp && rankOf(info.rarity) >= min) enqueue(li, info, li.dataset.kqp, prioOf(info.rarity, false));
    });
  }
  let lastMin = autoMin();
  if (window.__kq && window.__kq.onChange) window.__kq.onChange(() => { const m = autoMin(); if (m !== lastMin) { lastMin = m; reapply(); } });

  let pending = 0;
  new MutationObserver(() => {
    if (pending) return;
    pending = setTimeout(() => { pending = 0; try { scan(); } catch (e) { console.warn('[price-chips]', e); } }, 400);
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'data-kqs'] });
  scan();
})();
