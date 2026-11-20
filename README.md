# KosLess

An unofficial browser extension for [Kosmora](https://kosmora.io) that makes opening packs and
selling cards quicker. Chrome, Edge (Manifest V3) and Firefox 128+.

Not made by or affiliated with Kosmora.

## What it does

**Pack summaries**
- Bigger, readable cards on 10-pack and megapack summaries, without zooming the whole site.
  Choose how many per row with the **− N per row +** pill or the `-` / `=` keys.
- **Price chips**: pack summary cards show their 30-day median and last sale automatically:
  every card by default, or only Uncommon / Rare / Epic and up (your choice in settings; quest
  cards always). Any card left out has a small **$** button to look it up.
- **Quest badges** on cards that belong to a quest: lights a star, already lit, keep (quest you
  don't follow yet), or a gift copy that never counts.

**Pulls panel** (bottom right)
- Every card priced this session, priciest first, with a minimum-price filter. Quest cards
  always show. Card names link to the card's page. A card you pulled more than once shows **×N**.
- **Select → Sell N** opens Kosmora's *Sell several cards* page with the ticked cards (up to 60).
  They stay ticked and marked *sent to Sell*, so once they're listed, **Remove** takes them off the list.
- The **×** on a row (shows on hover) removes that one card; the **×** in the header clears the
  whole list. This only tidies the list: your cards are never touched.

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

**Prefer pictures?** The [illustrated install guide](https://claude.ai/artifact/MX2nvM3DXwNBWJHw76TmSH)
walks through the same steps with a drawing of each screen, for Chrome, Edge and Firefox.

> [!IMPORTANT]
> **Pick a permanent home for the folder first**, for example `Documents\KosLess`, not your
> Downloads folder. Your browser remembers the extension *by where the folder is*. Move it,
> rename it or delete it, and the extension breaks or loses your settings.

### Chrome

1. Download **[kosless.zip](../../releases/latest/download/kosless.zip)**
   (always the newest version). Right-click it → **Extract All…** and extract it into that
   permanent folder, so `manifest.json` sits directly in `Documents\KosLess`.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** (top left) and pick that folder (the one with `manifest.json` in it).
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
> If you unzip it somewhere new (Windows likes to call it `kosless (1)`) and click
> **Load unpacked** again, your browser treats it as a *different* extension. Your album keys and
> settings stay behind in the old copy, and with both copies on, **every hotkey fires twice**.
> If that happens, remove the extra copy on the extensions page and keep the original.

1. Download **[kosless.zip](../../releases/latest/download/kosless.zip)**
   again (the link always gives the newest version) and extract it into the folder you loaded,
   the one with `manifest.json` in it. When Windows asks, choose **Replace the files**.
   (Installed from the old green-button ZIP? Your folder is the inner `kosless-main`; extract there.)
2. On `chrome://extensions` / `edge://extensions`, click the **reload** arrow (↻) on KosLess.
   Check that the version number changed.
3. Refresh any open Kosmora tab.

Firefox: after replacing the files, click **Reload** on KosLess in `about:debugging`.

Using git? `git clone` it once into the permanent folder, then `git pull` and step 2 to update.

**Hear about updates:** on the repo page, **Watch** → **Custom** → tick **Releases**. GitHub then
tells you when a new version is out. The [Releases page](../../releases)
says what changed.

## Settings

Click the extension's toolbar button, the ⚙ in the Pulls panel, or press **Shift+/** on Kosmora.

**Coming from KosMore?** In KosMore's settings use *Backup & restore → Export backup*, then
here use **Import KosMore backup**. Your album shortcuts, hotkeys, quick prices and minimums
come over. Turn KosMore off afterwards, or the same keys will fire twice.

## Requests and your account

- It only talks to kosmora.io, signed in as you. Nothing is sent anywhere else, and settings stay
  in your browser.
- Price lookups go one at a time and stay under Kosmora's limit for them (120 a minute), and
  pause for as long as Kosmora asks if it ever says to slow down. Opening packs faster than that
  just means the prices fill in a little later; if you open a lot at once, set Auto-price to
  Uncommon or Rare and up. Results are reused for 6 hours, shared by all your Kosmora tabs.
- It never bids, buys, lists or opens packs. The only change it makes to your account is adding
  a card to an album when you press an album hotkey. **Sell N** only opens Kosmora's own batch
  sell page; you set prices and confirm there.

## Credits

Thanks to [KosMore](https://github.com/SYKRyan/kosmore), whose hotkeys and sell-page helpers
inspired several features here. This extension's code is its own.

## License

MIT. See [LICENSE](LICENSE).
