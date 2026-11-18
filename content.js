// Kosmora KosLess: content script. Display-only.
// Reads /api/quests (the same JSON the Quests page loads) at most once per 10 minutes,
// then badges every rendered card that is a quest star. No per-card requests, no writes.
(() => {
  if (window.__kqsLoaded) return;
  window.__kqsLoaded = true;

  const TTL = 10 * 60 * 1000;
  const ATTR = 'data-kqs';
  const EXCLUDE = '.md-turn,.md-bids,.md-sale,.mk-act,.md-lot,.md-ledger,.bsell-row,.ko-face-back,.kc-back,#kqs-panel';
  const CACHE_KEY = 'kqs.quests';

  let map = null;      // subjectId -> { q, following, lit, held }
  let loadedAt = 0;
  let loading = null;
  let refreshTimer = null;

  const title = (id) => id.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  function buildMap(data) {
    const m = new Map();
    for (const q of data.quests || []) {
      for (const s of q.stars || []) {
        m.set(String(s.subjectId), { q: q.id, following: q.state === 'following', lit: !!s.lit, held: !!s.held, blocked: !!s.blocked });
      }
    }
    return m;
  }

  function loadQuests(force) {
    if (!force && map && Date.now() - loadedAt < TTL) return Promise.resolve(map);
    if (loading) return loading;
    loading = (async () => {
      try {
        let data = null;
        if (!force) {
          try {
            const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
            if (c && Date.now() - c.at < TTL) data = c.data;
          } catch (e) { /* ignore */ }
        }
        if (!data) {
          const r = await fetch('/api/quests', { credentials: 'include' });
          if (!r.ok) throw new Error('quests ' + r.status);
          data = await r.json();
          try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data })); } catch (e) { /* ignore */ }
        }
        map = buildMap(data);
        loadedAt = Date.now();
      } catch (e) {
        console.warn('[quest-spotter] quests unavailable:', e);
        if (!map) map = new Map();
      } finally {
        loading = null;
      }
      schedule();
      return map;
    })();
    return loading;
  }

  function cardId(el) {
    const img = el.querySelector('img.kc-img');
    if (img) {
      const src = [img.currentSrc, img.getAttribute('src'), img.getAttribute('data-src'), img.getAttribute('srcset')].filter(Boolean).join(' ');
      const m = src.match(/\/media\/cards\/(\d+)\//);
      if (m) return m[1];
    }
    const a = el.closest('a[href*="/card/"]') || el.querySelector('a[href*="/card/"]');
    if (a) {
      const m = (a.getAttribute('href') || '').match(/\/card\/(\d+)(?:[/?#]|$)/);
      if (m) return m[1];
    }
    const corner = el.querySelector('[data-testid="card-corner"]');
    if (corner) {
      const m = (corner.textContent || '').match(/No\.\s*(\d+)/i);
      if (m) return m[1];
    }
    return null;
  }

  function cardName(el, id) {
    const img = el.querySelector('img.kc-img');
    const alt = img && (img.getAttribute('alt') || '').trim();
    if (alt) return alt;
    const t = el.querySelector('.kc-name,.kc-title,[class*="kc-name"],h1,h2,h3');
    if (t && t.textContent.trim()) return t.textContent.trim();
    return 'card ' + id;
  }

  function classify(s) {
    const name = title(s.q);
    if (s.following && !s.lit) return { kind: 'lights', text: '★ ' + name, tip: 'Lights a star in ' + name + ' (you follow it).' };
    if (s.following) return { kind: 'lit', text: '✓ ' + name, tip: name + ': star already lit. This copy is sale stock.' };
    if (s.blocked && s.held) return { kind: 'dead', text: '✕ ' + name, tip: name + ': your copy came by gift or trade and never counts. Sell it.' };
    return { kind: 'keep', text: 'Q ' + name, tip: 'Quest card for ' + name + ' (not followed yet). Keep it: the star lights the moment you follow.' };
  }

  function badge(el, info, key) {
    if (el.getAttribute(ATTR) === key) return;
    el.querySelectorAll(':scope > .kqs-badge').forEach((b) => b.remove());
    el.setAttribute(ATTR, key);
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const b = document.createElement('div');
    b.className = 'kqs-badge kqs-' + info.kind;
    b.textContent = info.text;
    b.title = info.tip;
    el.appendChild(b);
  }

  function unbadge(el) {
    if (!el.hasAttribute(ATTR)) return;
    el.removeAttribute(ATTR);
    el.querySelectorAll(':scope > .kqs-badge').forEach((b) => b.remove());
  }

  // ---- pull log: handed to the Pulls panel (panel.js) since Nov 17 ----
  const pullKeys = new Set();

  function packContext() {
    const u = new URL(location.href);
    return u.pathname + '?' + (u.searchParams.get('batch') || u.searchParams.get('id') || '');
  }

  // The panel keys rows like the price chips ("<id>", or "<id>:veil" for a shiny copy), so the quest
  // mark lands on the same row as that copy's price (0.6.4 fix; until then it always went to "<id>").
  function logPull(id, name, s, info, rowKey) {
    const key = packContext() + '#' + rowKey;
    if (pullKeys.has(key)) return;
    pullKeys.add(key);
    try { window.dispatchEvent(new CustomEvent('kqs-pull', { detail: { id, key: rowKey, name, quest: title(s.q), kind: info.kind } })); } catch (e) { /* ignore */ }
    if (info.kind === 'lights') {
      // The star should now be lit server-side; re-read so a second copy reads as sale stock.
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => loadQuests(true), 5000);
    }
  }

  // ---- scanning ----
  function scan() {
    if (!map) return;
    const els = document.querySelectorAll('.kc-article');
    for (const el of els) {
      if (el.closest(EXCLUDE)) continue;
      const id = cardId(el);
      if (!id) continue;
      const s = map.get(id);
      if (!s) { unbadge(el); continue; }
      const info = classify(s);
      badge(el, info, id + ':' + info.kind);
      const card = el.closest('.ko-card');
      const shown = card ? card.classList.contains('ko-beat-shown') : !!el.closest('.ko-summary');
      if (shown) {
        const host = el.closest('li, .ko-card') || el;
        logPull(id, cardName(el, id), s, info, host.querySelector('.kc-veil') ? id + ':veil' : id);
      }
    }
  }

  let pending = 0;
  function schedule() {
    if (pending) return;
    pending = setTimeout(() => { pending = 0; try { scan(); } catch (e) { console.warn('[quest-spotter]', e); } }, 120);
  }

  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type !== 'childList' || m.addedNodes.length) { schedule(); return; }
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'src'] });

  loadQuests(false);
  setInterval(() => loadQuests(false), TTL + 1000);
})();
