// KosLess sell-page helpers (Nov 17, 2026), single-card sell page (/market/sell?subject=…).
// Under the starting price: quick price buttons, Last sale and Lowest listed (click to fill, with
// an adjustment), and a warning when the price is under your own minimum for the card's rarity.
// Reads: Last sale reuses the price chips' cache, else 1 read; Lowest listed is 1 market search.
// Both run once per card per visit. Nothing is submitted: you still press List for sale.
(() => {
  if (window.__kqSell) return;
  window.__kqSell = true;
  const kq = window.__kq;
  if (!kq) return;

  const kosmo = (s) => Math.round(Number(s || 0) / 1e6);
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];
  let built = null;   // { form, box, id }
  const memo = new Map();   // per card id, this page load: { last: Promise, lowest: Promise } so rebuilds don't re-read

  function setPrice(input, v) {
    if (!input || input.disabled || input.readOnly) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, String(v));
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    input.focus();
  }

  function rarityOf(form) {
    const scope = form.closest('.deal') || document;
    const t = (scope.querySelector('.deal-visual .kc-rarity-name, .deal-visual [class*="rarity-name"]') || {}).textContent || '';
    return RARITIES.find((r) => t.trim().toLowerCase() === r.toLowerCase()) || RARITIES.find((r) => new RegExp('\\b' + r + '\\b', 'i').test(scope.querySelector('.deal-visual')?.textContent || '')) || '';
  }

  async function lastSale(id) {
    try {
      const c = JSON.parse(sessionStorage.getItem('kqp.cache') || '{}')[id];
      if (c && c.p && Date.now() - c.at < 30 * 60 * 1000) return c.p;
    } catch (e) { /* ignore */ }
    const r = await fetch('/api/cards/' + id + '/prices', { credentials: 'include' });
    if (!r.ok) throw new Error(r.status === 429 ? 'rate limited' : 'HTTP ' + r.status);
    return (await r.json()).prices || {};
  }

  // One market search by name (the first page of results). Listings don't say which finish they
  // are, so this is the lowest across finishes; the tooltip says how many results were checked.
  async function lowestListed(id, name) {
    const r = await fetch('/api/auctions?q=' + encodeURIComponent(name) + '&sort=ending', { credentials: 'include' });
    if (!r.ok) throw new Error(r.status === 429 ? 'rate limited' : 'HTTP ' + r.status);
    const j = await r.json();
    const items = j.items || [];
    const mine = items.filter((a) => a.card && String(a.card.subjectId) === String(id) && a.state === 'open' && !a.yours);
    const partial = (j.total || items.length) > items.length;
    const note = 'across all finishes; checked ' + items.length + (partial ? ' of ' + j.total : '') + ' market results for this name';
    if (!mine.length) return { value: null, note: (partial ? 'None in the first ' + items.length + ' results (' + j.total + ' total)' : 'No one else has it listed') };
    return { value: Math.min(...mine.map((a) => kosmo(a.bestBid != null ? (a.bestBid.amount ?? a.bestBid.price ?? a.bestBid) : a.startPrice))), note: 'Lowest current bid or start price ' + note };
  }
  // One read per card per 10 minutes. Kosmora is a single-page app, so "once per page load" could keep
  // a bid or price for hours (0.6.4 review fix).
  const MEMO_MS = 10 * 60 * 1000;
  function once(id, k, f) {
    const m = memo.get(id) || {};
    if (!m[k] || Date.now() - m[k].at > MEMO_MS) {
      const p = f();
      m[k] = { p, at: Date.now() };
      memo.set(id, m);
      p.catch(() => { if (m[k] && m[k].p === p) delete m[k]; });
    }
    return m[k].p;
  }

  function chip(label, value, adj, input, title) {
    const b = document.createElement(value == null ? 'span' : 'button');
    b.className = 'kq-sell-chip';
    if (value == null) { b.textContent = label + ' —'; b.title = title || ''; return b; }
    b.type = 'button';
    const target = Math.max(1, value + (adj || 0));
    b.textContent = label + ' ' + fmt(value);
    b.title = (title ? title + '\n' : '') + 'Click to set the starting price to ' + fmt(target) + (adj ? ' (' + (adj > 0 ? '+' : '') + adj + ')' : '');
    b.addEventListener('click', () => setPrice(input, target));
    return b;
  }

  function build(form) {
    const s = kq.settings.sell;
    const input = form.querySelector('input[data-testid="sell-start"]') || form.querySelector('.coin-input input');
    const field = input && (input.closest('label.fld') || input.closest('.fld') || input.parentElement);
    if (!input || !field) return;
    const id = new URLSearchParams(location.search).get('subject') || '';
    const name = (form.querySelector('.deal-name') || {}).textContent?.trim() || '';
    const box = document.createElement('div');
    box.className = 'kq-sell';
    const quick = document.createElement('div');
    quick.className = 'kq-sell-row';
    for (const q of s.quick) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'kq-sell-chip'; b.textContent = fmt(q);
      b.addEventListener('click', () => setPrice(input, q));
      quick.appendChild(b);
    }
    const market = document.createElement('div');
    market.className = 'kq-sell-row';
    const warn = document.createElement('div');
    warn.className = 'kq-sell-warn';
    box.append(quick, market, warn);
    field.insertAdjacentElement('afterend', box);
    built = { form, box, id };

    // minimum warning
    const rarity = rarityOf(form);
    const min = rarity ? Number(s.minimums[rarity] || 0) : 0;
    const check = () => {
      const v = Number(String(input.value).replace(/[^\d.]/g, ''));
      warn.textContent = min && v && v < min ? 'Under your ' + rarity + ' minimum of ' + fmt(min) : '';
    };
    input.addEventListener('input', check);
    check();

    // market chips, read once per visit
    if (!id) return;
    if (s.lastSale) {
      const slot = document.createElement('span'); slot.className = 'kq-sell-chip kq-wait'; slot.textContent = 'Last sale …';
      market.appendChild(slot);
      once(id, 'last', () => lastSale(id)).then((p) => {
        const last = p.sales && p.sales[0];
        slot.replaceWith(chip('Last sale', last ? kosmo(last.price) : null, s.lastSaleAdj, input,
          last ? 'Median ' + fmt(kosmo(p.median)) + ' on ' + p.count + (p.count >= 20 ? '+' : '') + ' sales in 30 days (plain finish)' : 'No sales in 30 days'));
      }).catch((e) => { slot.textContent = 'Last sale: ' + e.message; });
    }
    if (s.lowest && name) {
      const slot = document.createElement('span'); slot.className = 'kq-sell-chip kq-wait'; slot.textContent = 'Lowest listed …';
      market.appendChild(slot);
      const cached = memo.get(id) && memo.get(id).lowest;
      setTimeout(() => {
        once(id, 'lowest', () => lowestListed(id, name)).then((v) => {
          slot.replaceWith(chip('Lowest listed', v.value, s.lowestAdj, input, v.note));
        }).catch((e) => { slot.textContent = 'Lowest listed: ' + e.message; });
      }, cached ? 0 : 1500 + Math.random() * 1500);
    }
  }

  function scan() {
    if (!kq.settings.sell.enabled || location.pathname !== '/market/sell') { if (built && !built.box.isConnected) built = null; return; }
    const form = document.querySelector('form.sell-form');
    if (!form) return;
    const id = new URLSearchParams(location.search).get('subject') || '';
    if (built && built.form === form && built.box.isConnected && built.id === id) return;
    if (built && built.box.isConnected) built.box.remove();
    build(form);
  }

  let pend = 0;
  new MutationObserver(() => {
    if (pend) return;
    pend = setTimeout(() => { pend = 0; try { scan(); } catch (e) { console.warn('[kq-sell]', e); } }, 300);
  }).observe(document.documentElement, { childList: true, subtree: true });
  // Rebuild only when the sell settings change (the first storage load usually changes nothing).
  let sellSig = JSON.stringify(kq.settings.sell);
  kq.onChange((st) => {
    const sig = JSON.stringify(st.sell);
    if (sig === sellSig) return;
    sellSig = sig;
    if (built) { built.box.remove(); built = null; }
    scan();
  });
  scan();
})();
