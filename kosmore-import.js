// Convert a KosMore backup (Backup & restore -> Export backup, format "kosmore-backup") into
// KosLess settings. Pure function, no DOM or requests: settings.js calls it with your
// album list (for names) and your Kosmora handle (KosMore keys pinned albums per account).
// Testable in Node: require('./kosmore-import.js'); globalThis.kqFromKosMore(...).
(() => {
  const NAV = {
    home: 'home', collection: 'collection', albums: 'albums', fusion: 'fusion', marketBuy: 'market',
    marketAuctions: 'myAuctions', marketActivity: 'myActivity', odyssey: 'odyssey', packs: 'packs', pulsar: 'pulsar',
    quests: 'quests', social: 'social', talents: 'talents', tomes: 'tomes', families: 'families', gallery: 'gallery',
    atlas: 'atlas', history: 'history',
  };
  const PACK = {
    nextCard: 'nextCard', previousCard: 'previousCard', skipOpening: 'skip', nextPack: 'nextPack',
    seeCard: 'seeCard', focusFirstCard: 'firstCard', focusLastCard: 'lastCard',
  };
  const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];

  function combo(b) {
    if (!b || !b.code) return '';
    return (b.ctrl ? 'Ctrl+' : '') + (b.alt ? 'Alt+' : '') + (b.shift ? 'Shift+' : '') + (b.meta ? 'Meta+' : '') + b.code;
  }

  // backup: parsed JSON. albums: [{id, name}] from /api/albums (may be empty). handle: your
  // Kosmora handle, or '' to use the first account in the backup.
  function kqFromKosMore(backup, albums, handle) {
    if (!backup || backup.format !== 'kosmore-backup' || !backup.settings) throw new Error('Not a KosMore backup file');
    const s = backup.settings;
    const out = { nav: { keys: {} }, pack: { keys: {} }, albums: {}, sell: {} };
    const notes = [];

    if (s.hotkeys) {
      let n = 0;
      for (const [k, v] of Object.entries(s.hotkeys)) if (NAV[k]) { out.nav.keys[NAV[k]] = combo(v); n++; }
      notes.push(n + ' navigation keys');
    }
    if (typeof s.navigationHotkeysEnabled === 'boolean') out.nav.enabled = s.navigationHotkeysEnabled && s.hotkeysEnabled !== false;

    if (s.packOpeningHotkeys) {
      let n = 0;
      for (const [k, v] of Object.entries(s.packOpeningHotkeys)) if (PACK[k]) { out.pack.keys[PACK[k]] = combo(v); n++; }
      notes.push(n + ' pack keys');
    }
    if (typeof s.packOpeningHotkeysEnabled === 'boolean') out.pack.enabled = s.packOpeningHotkeysEnabled && s.hotkeysEnabled !== false;
    if (typeof s.anyKeyDismissesFoundPack === 'boolean') out.pack.anyKeyDismiss = s.anyKeyDismissesFoundPack;
    if (typeof s.autoSkipOpening === 'boolean') out.pack.autoSkip = s.autoSkipOpening;
    if (typeof s.autoDismissFoundPack === 'boolean') out.pack.autoDismiss = s.autoDismissFoundPack;

    const pinnedBy = s.pinnedAlbums || {};
    const accounts = Object.keys(pinnedBy);
    const acct = (handle && accounts.find((a) => a.toLowerCase() === String(handle).toLowerCase())) || accounts[0];
    if (acct) {
      const keys = (s.pinnedAlbumHotkeys || {})[acct] || {};
      const byId = new Map((albums || []).map((a) => [a.id, a.name]));
      const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const pinned = pinnedBy[acct] || [];
      const list = pinned.filter((id) => UUID.test(String(id))).map((id) => ({ id, name: byId.get(id) || 'album ' + id.slice(0, 8), key: combo(keys[id]) }));
      const bad = pinned.length - list.length;   // not an album id: dropped, and said so (0.6.4)
      const missing = (albums && albums.length ? list.filter((a) => !byId.has(a.id)).length : 0) + bad;
      out.albums.list = list.filter((a) => !albums || !albums.length || byId.has(a.id));
      if (typeof s.pinnedAlbumsEnabled === 'boolean') out.albums.enabled = s.pinnedAlbumsEnabled;
      notes.push(out.albums.list.length + ' albums' + (missing ? ' (' + missing + ' no longer exist)' : '') + (accounts.length > 1 ? ' from ' + acct : ''));
    }

    if (Array.isArray(s.salesQuickPrices)) {
      out.sell.quick = s.salesQuickPricesEnabled === false ? [] : s.salesQuickPrices.filter((n) => Number(n) > 0).map(Number);
      notes.push(out.sell.quick.length + ' quick prices');
    }
    if (s.salesCustomMinimums) {
      out.sell.minimums = {};
      for (const r of RARITIES) out.sell.minimums[r] = s.salesCustomMinimumsEnabled === false ? 0 : Number(s.salesCustomMinimums[r] || 0);
      notes.push(s.salesCustomMinimumsEnabled === false ? 'minimums off' : 'rarity minimums');
    }
    // Only the adjustments: Last sale / Lowest listed stay on here (KosMore users often had them
    // off for its heavier reads; ours cost at most 2 reads per sell page).
    if (typeof s.salesLastSaleAdjustment === 'number') out.sell.lastSaleAdj = s.salesLastSaleAdjustment;
    if (typeof s.salesLowestListingAdjustment === 'number') out.sell.lowestAdj = s.salesLowestListingAdjustment;

    return { patch: out, summary: 'Imported ' + notes.join(', ') + '.' };
  }

  globalThis.kqFromKosMore = kqFromKosMore;
})();
