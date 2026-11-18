# KosLess

An unofficial browser extension for [Kosmora](https://kosmora.io) that makes opening packs and
selling cards quicker. Chrome, Edge (Manifest V3) and Firefox 128+.

Not made by or affiliated with Kosmora.

## What it does

**Pack summaries**
- Bigger, readable cards on 10-pack and megapack summaries, without zooming the whole site.
  Choose how many per row with the **− N per row +** pill or the `-` / `=` keys.
- **Price chips**: Epic, Legendary, Mythic and quest cards show their 30-day median and last
  sale automatically. Every other card has a small **$** button to look it up.
- **Quest badges** on cards that belong to a quest: lights a star, already lit, keep (quest you
  don't follow yet), or a gift copy that never counts.

**Pulls panel** (bottom right)
- Every card priced this session, priciest first, with a minimum-price filter. Quest cards
  always show. Card names link to the card's page.
- **Select → Sell N** opens Kosmora's *Sell several cards* page with the ticked cards (up to 60).

**Sell page**
- Quick price buttons, **Last sale** and **Lowest listed** (click to fill, with an adjustment),
  and a warning when the price is under your own minimum for that rarity.
- Sale history moves beside the form on wide screens, so you can see it without scrolling.

**Hotkeys** (all changeable in settings)
- **Albums**: point at a card and press a key to add it to an album (for example, a "sell" album).
  Your album keys are listed at the bottom of pack pages; click the list to change them.
- **Pack opening**: next card, previous, first/last, skip, next pack, open card; any key dismisses
  a found-pack popup. Optional auto-skip and auto-dismiss (off by default).
- **Navigation**: Shift+letter to jump to Home, Collection, Market, Packs, Talents and more.

## Install

1. Download this repository (Code → Download ZIP) and unzip it.
2. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**.
3. Click **Load unpacked** and pick the unzipped folder.
4. Refresh any open Kosmora tab.

**Firefox**: open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on** and pick
`manifest.json` in the unzipped folder. Firefox removes temporary add-ons when it closes.

To update, replace the folder, click the extension's reload button, and refresh Kosmora.

## Settings

Click the extension's toolbar button, the ⚙ in the Pulls panel, or press **Shift+/** on Kosmora.

**Coming from KosMore?** In KosMore's settings use *Backup & restore → Export backup*, then
here use **Import KosMore backup**. Your album shortcuts, hotkeys, quick prices and minimums
come over. Turn KosMore off afterwards, or the same keys will fire twice.

## Requests and your account

- It only talks to kosmora.io, signed in as you. Nothing is sent anywhere else, and settings stay
  in your browser.
- Price lookups go one at a time, 4-10 seconds apart, only while the tab is visible, and pause
  when Kosmora asks clients to slow down. Results are reused for 30 minutes.
- It never bids, buys, lists or opens packs. The only change it makes to your account is adding
  a card to an album when you press an album hotkey. **Sell N** only opens Kosmora's own batch
  sell page; you set prices and confirm there.

## Credits

Thanks to [KosMore](https://github.com/SYKRyan/kosmore), whose hotkeys and sell-page helpers
inspired several features here. This extension's code is its own.

## License

MIT. See [LICENSE](LICENSE).
