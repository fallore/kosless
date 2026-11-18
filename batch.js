// KosLess batch sell page helper (0.6.12, Nov 18, 2026), /market/sell/batch.
// Under each card's "Recent sales of this card" line: the median, last sale, low-high and sale count
// from the price chips' cache (prices.js, 6 h, shared by tabs). Click "med" or "last" to put that
// number in the card's starting price box. Cards with no cached price get a "$" button that asks
// through the chips' paced queue (one read, same spacing). Nothing is read on its own and nothing
// is submitted: you still press Kosmora's own button to list.
(() => {
  if (window.__kqBatch) return;
  window.__kqBatch = true;

  const PATH = '/market/sell/batch';
  const kosmo = (s) => Math.round(Number(s || 0) / 1e6);
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const day = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const asking = new Set();   // keys waiting on a read

  function setPrice(input, v) {
    if (!input || input.disabled || input.readOnly) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, String(v));
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  function rowInfo(row) {
    const img = row.querySelector('img.kc-img');
    const src = img ? [img.currentSrc, img.getAttribute('src')].filter(Boolean).join(' ') : '';
    const m = src.match(/\/media\/cards\/(\d+)\//);
    if (!m) return null;
    return { id: m[1], finish: row.querySelector('.kc-veil') ? 'veil' : '' };
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function fillBtn(label, value, input) {
    const b = el('button', 'kq-bl-fill', label + ' ' + fmt(value));
    b.type = 'button';
    b.title = 'Set this card\'s starting price to ' + fmt(value);
    b.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); setPrice(input, value); });
    return b;
  }

  function paint(row) {
    const info = rowInfo(row);
    const host = row.querySelector('.bsell-id');
    const input = row.querySelector('.bsell-prices input');
    if (!info || !host || !input) return;
    const key = info.id + (info.finish ? ':' + info.finish : '');
    const api = window.__kqp;
    const hit = api ? api.get(info.id, info.finish) : null;
    const state = hit ? 'hit' + hit.at : asking.has(key) ? 'asking' : 'none';
    let line = host.querySelector(':scope > .kq-bline');
    if (line && line.dataset.sig === key + '|' + state) return;   // unchanged: don't touch the page
    if (!line) { line = el('div', 'kq-bline'); host.appendChild(line); }
    line.dataset.sig = key + '|' + state;
    line.replaceChildren();
    const fin = info.finish === 'veil' ? 'shiny ' : '';
    if (hit) {
      const p = hit.p || {};
      if (!p.count) { line.append(el('span', 'kq-bl-note', 'no ' + fin + 'sales in ' + (p.days || 30) + ' days')); return; }
      const sales = p.sales || [];
      line.append(fillBtn('med', kosmo(p.median), input));
      if (sales[0]) line.append(fillBtn('last', kosmo(sales[0].price), input));
      const note = el('span', 'kq-bl-note', fmt(kosmo(p.low)) + '–' + fmt(kosmo(p.high)) + ' · ' + p.count + (p.count >= 20 ? '+' : '') + ' ' + fin + 'sales/' + (p.days || 30) + 'd');
      note.title = sales.length ? 'Recent: ' + sales.slice(0, 4).map((s) => fmt(kosmo(s.price)) + ' (' + day(s.soldAt) + ')').join(', ') : '';
      line.append(note);
      return;
    }
    if (!api) return;
    if (asking.has(key)) { line.append(el('span', 'kq-bl-note', 'reading price…')); return; }
    const b = el('button', 'kq-bl-ask', '$');
    b.type = 'button';
    b.title = 'Read this card\'s ' + fin + 'sales (one paced read, like the $ on pack summaries)';
    b.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      asking.add(key);
      paint(row);
      api.request(info.id, info.finish, () => { asking.delete(key); tick(); });
    });
    line.append(b, el('span', 'kq-bl-note', 'not priced yet'));
  }

  function tick() {
    if (location.pathname !== PATH) return;
    document.querySelectorAll('.bsell-row').forEach((row) => { try { paint(row); } catch (e) { console.warn('[kq-batch]', e); } });
  }
  setInterval(tick, 700);
  // Prices read in another tab show up here too.
  addEventListener('storage', (ev) => { if (ev.key === 'kqp.cache') tick(); });
})();
