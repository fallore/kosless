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
- **Pack opening**: WASD to move around the summary (W/S rows, A/D cards), first/last, skip (S while opening), next pack,
  open card (F), price the focused card (Q); any key dismisses
  a found-pack popup. Optional auto-skip and auto-dismiss (off by default).
- **Navigation**: Shift+letter to jump to Home, Collection, Market, Packs, Talents and more.

## Install

KosLess isn't in any extension store, so it doesn't update by itself. You install it from a folder
and update it by replacing that folder (below).

> [!IMPORTANT]
> **Pick a permanent home for the folder first**, for example `Documents\KosLess`, not your
> Downloads folder. Your browser remembers the extension *by where the folder is*. Move it,
> rename it or delete it, and the extension breaks or loses your settings.

### Chrome

1. Download this repository (green **Code** button → **Download ZIP**) and unzip it into that
   permanent folder.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** (top left) and pick the folder that has `manifest.json` in it.
4. Refresh any open Kosmora tab.

### Edge

Same as Chrome, at `edge://extensions`. **Developer mode** is a switch in the left-hand menu
(or at the bottom of the page on narrow windows). Then **Load unpacked**, pick the folder, and
refresh Kosmora.

### Firefox

If you use Firefox, you obviously already know what you're doing. Firefox only runs unsigned
add-ons as *temporary* ones, though:

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on** and pick `manifest.json` in the folder.
3. Refresh any open Kosmora tab.

> [!WARNING]
> **Firefox removes temporary add-ons every time it closes.** Repeat steps 1-2 after each restart.

## Updating

> [!CAUTION]
> **Unzip the new version OVER the old folder, in the same place. Don't load it as a second copy.**
> If you unzip it somewhere new (Windows likes to call it `kosless-main (1)`) and click
> **Load unpacked** again, your browser treats it as a *different* extension. Your album keys and
> settings stay behind in the old copy, and with both copies on, **every hotkey fires twice**.
> If that happens, remove the extra copy on the extensions page and keep the original.

1. Download the new ZIP and unzip it into the **same folder**, replacing the old files.
2. On `chrome://extensions` / `edge://extensions`, click the **reload** arrow (↻) on KosLess.
   Check that the version number changed.
3. Refresh any open Kosmora tab.

Firefox: after replacing the files, click **Reload** on KosLess in `about:debugging`.

Using git? `git clone` it once into the permanent folder, then `git pull` and step 2 to update.

## Settings

Click the extension's toolbar button, the ⚙ in the Pulls panel, or press **Shift+/** on Kosmora.

**Coming from KosMore?** In KosMore's settings use *Backup & restore → Export backup*, then
here use **Import KosMore backup**. Your album shortcuts, hotkeys, quick prices and minimums
come over. Turn KosMore off afterwards, or the same keys will fire twice.

## Requests and your account

- It only talks to kosmora.io, signed in as you. Nothing is sent anywhere else, and settings stay
  in your browser.
- Price lookups go one at a time, 4-10 seconds apart, only while the tab is visible, and pause
  when Kosmora asks clients to slow down. Results are reused for 6 hours,
  shared by all your Kosmora tabs.
- It never bids, buys, lists or opens packs. The only change it makes to your account is adding
  a card to an album when you press an album hotkey. **Sell N** only opens Kosmora's own batch
  sell page; you set prices and confirm there.

## Credits

Thanks to [KosMore](https://github.com/SYKRyan/kosmore), whose hotkeys and sell-page helpers
inspired several features here. This extension's code is its own.

## License

MIT. See [LICENSE](LICENSE).
