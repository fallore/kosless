// Kosmora price chips on pack summaries (Nov 17, 2026). Display-only: reads sale history, never
// bids, lists or clicks anything on the page.
//
// Which cards: Epic and up, plus quest cards (KosLess's badge), are read automatically.
// Every other card gets a small "$" button that reads that one card when clicked.
// How: one request per card (/api/cards/<id>/prices, the same call the card page makes), one at
// a time, 4-10 s apart with jitter, only while the tab is visible. A 429 pauses the queue for the
// server's Retry-After (at least 30 s). Results are cached for the browser session.
(() => {
  if (window.__kqpLoaded) return;
  window.__kqpLoaded = true;

  const AUTO = new Set(['epic', 'legendary', 'mythic']);
  const AUTO_CAP = 12;               // automatic reads per summary page, at most
  const GAP_MIN = 4000, GAP_MAX = 10000;
  const CACHE_KEY = 'kqp.cache';
  const CACHE_TTL = 6 * 60 * 60 * 1000;   // 6 h, shared by tabs (0.6.5)

  // Shared by every Kosmora tab (localStorage, since 0.6.4): the price cache, the time of the last
  // read and any 429 pause. Until 0.6.3 each tab kept its own, so two tabs on pack summaries read
  // twice as fast and a 429 in one tab didn't slow the other.
  const PACE_KEY = 'kqp.pace';       // { lastAt, pausedUntil }
  const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (e) { return {}; } };
  const pace = () => readJSON(PACE_KEY);
  const setPace = (patch) => { try { localStorage.setItem(PACE_KEY, JSON.stringify({ ...pace(), ...patch })); } catch (e) { /* ignore */ } };

  let cache = readJSON(CACHE_KEY);
  const saveCache = () => {
    const shared = readJSON(CACHE_KEY);   // another tab may have added cards meanwhile; newest entry wins
    for (const [k, v] of Object.entries(shared)) if (!cache[k] || cache[k].at < v.at) cache[k] = v;
    const keys = Object.keys(cache);
    if (keys.length > 300) keys.sort((a, b) => cache[a].at - cache[b].at).slice(0, keys.length - 300).forEach((k) => delete cache[k]);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* ignore */ }
  };
  try { sessionStorage.removeItem(CACHE_KEY); } catch (e) { /* the 0.6.3 per-tab cache */ }

  const queue = [];                  // { key, id, finish }
  const waiting = new Map();         // key -> [li]
  let busy = false;
  let lastAt = 0;
  let pausedUntil = 0;
  let autoUsed = 0;
  let pageKey = '';

  const diag = (d) => { try { window.dispatchEvent(new CustomEvent('kqp-diag', { detail: d })); } catch (e) { /* ignore */ } };
  const jitter = () => GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN);
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
      c.textContent = 'no ' + fin + 'sales';
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

  function enqueue(li, info, key) {
    if (fresh(key)) { render(li, key); return; }
    const list = waiting.get(key);
    if (list) { if (!list.includes(li)) list.push(li); render(li, key); return; }
    waiting.set(key, [li]);
    queue.push({ key, id: info.id, finish: info.finish, fa: info.fa, name: info.name, rarity: info.rarity });
    render(li, key);
    pump();
  }

  // 0.6.12: the batch sell page (batch.js) reads cached prices and asks for new ones through the same
  // paced queue. A click there goes to the front of the queue (it's the card you're looking at); the
  // spacing between reads is unchanged.
  window.__kqp = {
    get(id, finish) {
      const key = id + (finish ? ':' + finish : '');
      return fresh(key) ? cache[key] : null;
    },
    request(id, finish, cb) {
      const key = id + (finish ? ':' + finish : '');
      if (fresh(key)) { cb(cache[key]); return; }
      const list = waiting.get(key);
      if (list) { list.push(cb); return; }
      waiting.set(key, [cb]);
      // panel: false (0.6.14): a sell-page lookup isn't a pull, so it stays out of the Pulls panel.
      queue.unshift({ key, id, finish, fa: false, name: '', rarity: '', panel: false });
      pump();
    },
    queued: () => queue.length,
  };

  function pump() {
    if (busy || !queue.length) return;
    const now = Date.now();
    if (document.visibilityState !== 'visible') return;   // resumes on visibilitychange
    const sh = pace();
    pausedUntil = Math.max(pausedUntil, sh.pausedUntil || 0);
    const last = Math.max(lastAt, sh.lastAt || 0);
    const wait = Math.max(pausedUntil - now, last ? last + jitter() - now : 800 + Math.random() * 1500, 0);
    busy = true;
    setTimeout(run, wait);
  }

  async function run() {
    if (document.visibilityState !== 'visible' || Date.now() < pausedUntil) { busy = false; pump(); return; }
    // Another tab may have read (or hit a 429) while this one waited: check the shared pace again.
    const sh = pace();
    if (Date.now() < (sh.pausedUntil || 0) || (sh.lastAt && Date.now() - sh.lastAt < GAP_MIN)) { busy = false; pump(); return; }
    if (queue.length && fresh(queue[0].key)) {   // another tab read this card meanwhile
      const done = queue.shift();
      (waiting.get(done.key) || []).forEach((li) => { if (typeof li === 'function') { try { li(cache[done.key]); } catch (e) { /* ignore */ } } else if (li.isConnected) render(li, done.key); });
      waiting.delete(done.key);
      busy = false; pump(); return;
    }
    const job = queue.shift();
    if (!job) { busy = false; return; }
    lastAt = Date.now();
    setPace({ lastAt });
    let entry;
    try {
      const r = await fetch('/api/cards/' + job.id + '/prices' + (job.finish ? '?finish=' + job.finish : ''), { credentials: 'include' });
      diag({ id: job.id, status: r.status, retryAfter: r.headers.get('Retry-After'), queued: queue.length, ms: Date.now() - lastAt });
      if (r.status === 429) {
        const ra = parseInt(r.headers.get('Retry-After') || '', 10);
        pausedUntil = Date.now() + Math.max(30, isFinite(ra) ? ra : 60) * 1000;
        setPace({ pausedUntil });   // every tab waits, not just this one
        queue.unshift(job);   // try this card again after the pause
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
    const pk = location.pathname + location.search;
    if (pk !== pageKey) { pageKey = pk; autoUsed = 0; }
    for (const li of lis) {
      if (li.dataset.kqp) {
        // Quest badges arrive after the quests list loads: promote an unread quest card to auto.
        const btn = li.querySelector(':scope > .kqp-btn');
        if (btn && li.querySelector('[data-kqs]') && autoUsed < AUTO_CAP) {
          const info = cardInfo(li);
          if (info) { autoUsed++; enqueue(li, info, li.dataset.kqp); }
        }
        continue;
      }
      const info = cardInfo(li);
      if (!info) continue;                       // picture not loaded yet; next scan picks it up
      const key = info.id + (info.finish ? ':' + info.finish : '');
      li.dataset.kqp = key;
      if (getComputedStyle(li).position === 'static') li.style.position = 'relative';
      const quest = !!li.querySelector('[data-kqs]');
      if (fresh(key)) { render(li, key); continue; }
      if ((AUTO.has(info.rarity) || quest) && autoUsed < AUTO_CAP) { autoUsed++; enqueue(li, info, key); }
      else addButton(li, info, key);
    }
  }

  let pending = 0;
  new MutationObserver(() => {
    if (pending) return;
    pending = setTimeout(() => { pending = 0; try { scan(); } catch (e) { console.warn('[price-chips]', e); } }, 400);
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'data-kqs'] });
  document.addEventListener('visibilitychange', pump);
  scan();
})();
