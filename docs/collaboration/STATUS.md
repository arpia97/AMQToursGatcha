# Shared Status and Handoff

Updated November 10, 2026, Asia/Seoul. This file is a coordination record; Git and deployment evidence must still be checked at task start.

## Active Task — One-Time 5-Card Special Pack (1 AG, 4 S-and-Up, 50% Character / 50% Seiyuu)

- Gemini owns implementation/commit: `src/special-pack.js`, `src/economy.js`, `src/engine.js`, `src/worker.js`, `src/aliases.js`, `src/economy-repair.js`, `public/pack-reveal.js`, `public/app.js`, `public/demo-features.js`, `tests/special-pack.test.mjs`, `docs/collaboration/STATUS.md`.
- Base SHA: `ff73f77`
- Other collaborator's work to preserve: Codex's background anime metadata enrichment pass, player accounts, economy/catalog state.
- Completed behavior / decisions:
  - Created `src/special-pack.js`:
    - `SpecialPack` class backed by `special_packs(player TEXT PRIMARY KEY, granted_at INTEGER NOT NULL, cards TEXT NOT NULL, seen INTEGER NOT NULL DEFAULT 0)`.
    - `drawFive()` draws 1 AG card guaranteed and 4 cards S-and-up (`["S", "SS", "SSS", "Ubers", "AG"]`).
    - Every card drawn rolls 50% Character / 50% Seiyuu first (`rand(2) === 0 ? "character" : "seiyuu"`), then uniformly selects among qualifying cards in that pool.
    - Avoids duplicate cards within the same pack when pool permits.
    - `ensureGranted(player)` grants the pack to registered players exactly once, immediately inserting the 5 cards into inventory.
    - `pendingPopup(player)` returns `{ cards }` while `seen === 0`.
    - `markSeen(player)` updates `seen = 1`.
  - Added `special_packs` to `src/economy.js`, `src/aliases.js` (identity migration), `src/economy-repair.js`, and `src/engine.js` (reset-player/reset-all).
  - In `src/worker.js`: executes `e.economy.specialPack.ensureGranted(session.player)` inside `e.tx()` when authenticated players request `state`.
  - In `src/engine.js`: returns `specialPack: { cards }` on `state(id)` if `seen === 0`, and includes all 5 card references in `catalog`.
  - Added action `special-pack-seen` in `src/economy.js` and demo fallback in `public/demo-features.js`.
  - In `public/pack-reveal.js`: updated sealed cinematic pack to render `SPECIAL BONUS PACK` eyebrow, AG aura glow, and results actions (`My Collection ↗` and `Continue`).
  - In `public/app.js`: automatically displays the special pack pop-up modal on site refresh or after login when `state.specialPack` is present, and acknowledges via `api("special-pack-seen")`.
  - Unit tests: `tests/special-pack.test.mjs` verifying draw distribution, 50/50 kind split, single-grant idempotency, inventory updates, state responses, and reset handling.
- Checks run and results: `node tools/check.mjs` (212 files passed), `node --test tests/*.test.mjs` (446/446 passed), `git diff --check` (clean).
- Runtime deployment version / live verification: Deployed to Cloudflare Worker `amqtours-gatcha` version **c157927c-e089-4f34-aa60-e47ee16c0f53**. Verified live read-only: `/api/health` (200, `{"ok":true,"service":"AMQ Tours Gatcha"}`), `/pack-reveal.js` (200, contains `SPECIAL BONUS PACK`). No manual data mutations.
- Integration owner / deployment owner: Gemini.

## Previous Task — Arrange Pinned Anime in Collection Arrange Mode

- Gemini owns implementation/commit: `src/collection.js`, `src/economy.js`, `src/economy-repair.js`, `public/pinned-anime-order.js`, `public/app.js`, `public/demo-features.js`, `public/features.css`, `tests/collection-controls.test.mjs`, `tests/economy.test.mjs`, `docs/collaboration/STATUS.md`.
- Base SHA: `a040b6c`
- Other collaborator's work to preserve: Codex's background anime metadata enrichment pass, player accounts, economy/catalog state.
- Completed behavior / decisions:
  - Added custom order persistence for pinned anime in `src/collection.js`:
    - Added `position INTEGER` column to `profile_anime` and index `profile_anime_order ON profile_anime(player, position IS NULL, position, at, series_key)`.
    - `pinned(player)` orders by `position IS NULL, position, at, series_key` when custom order is set, falling back to `animeProgressComparator`.
    - `pin(player, b)` appends newly pinned anime to `nextPos = maxPos != null ? maxPos + 1 : null`.
    - Added `reorderPinned(player, b)` action handler validating input array, preventing duplicate/foreign keys, checking concurrency (`expectedOrder`), and updating `profile_anime.position`.
  - Added `pinned-anime-order` routing in `src/economy.js` and column definition in `src/economy-repair.js`.
  - Created `public/pinned-anime-order.js` module exporting `createPinnedAnimeEditor`:
    - Drag handles (`⠿`), direct position rank inputs (`#`), keyboard up/down arrows, dirty-state tracking, and reset-to-progress buttons.
  - Linked to `#collection` page in `public/app.js`:
    - Clicking "Arrange Collection" enters arrange mode for both cards and pinned anime (rendered above collection cards if > 1 anime are pinned).
    - Drag-and-drop integrated via `installCardOrderDrag`.
    - Added "Save Pinned Order" button, and auto-saves dirty pinned anime order when submitting the collection arrangement form.
    - "Close Arrange" / "Cancel" or page switching (`hashchange`) safely cancels drag handles and closes the editor.
  - Added mock support in `public/demo-features.js`.
  - Styled arrange panel in `public/features.css`.
  - Tests: `tests/collection-controls.test.mjs` (pinned anime editor unit tests) and `tests/economy.test.mjs` (persistence and concurrency tests).
- Checks run and results: `node tools/check.mjs` (210 files passed), `node --test tests/*.test.mjs` (442/442 passed), `git diff --check` (clean).
- Runtime deployment version / live verification: Deployed to Cloudflare Worker `amqtours-gatcha` version **b205b1a5-915b-40ea-86eb-f1a945ab51fd**. Verified live read-only: `/api/health` (200, `{"ok":true,"service":"AMQ Tours Gatcha"}`), `/pinned-anime-order.js` (200, 4832 bytes). No data mutations.
- Integration owner / deployment owner: Gemini.

## Previous Task — Gambling History Pop-Up Across Pachinko Games

- Gemini owns implementation/commit: `public/gambling-history-ui.js`, `public/pachinko-ui.js`, `public/adventure-ui.js`, `public/blackjack-ui.js`, `public/horse-ui.js`, `public/mahjong-ui.js`, `public/app.js`, `public/pachinko.css`, `public/demo-features.js`, `src/pachinko.js`, `src/worker.js`, `tests/pachinko.test.mjs`, `docs/collaboration/STATUS.md`.
- Base SHA: `4e7da75`
- Other collaborator's work to preserve: Codex's background anime metadata enrichment pass and all economy/catalog state. No unowned or background files touched.
- Completed behavior / decisions:
  - Added "Gambling History" button to top-level Pachinko navigation (`.page-intro`), pre-selecting the active game tab.
  - Added "History" buttons to each of the six Pachinko mini-games:
    - Mahjong: Section header toolbar in `public/mahjong-ui.js`.
    - Horse Racing: Welcome screens, Ticket Desk section header, and Official Results podium in `public/horse-ui.js`.
    - Gem Faceting: Section header toolbar in `public/pachinko-ui.js`.
    - Roulette: Section controls toolbar in `public/adventure-ui.js`.
    - 67 Blackjack: Section header toolbar in `public/blackjack-ui.js`.
    - Mountain Climbing: Section header toolbar in `public/adventure-ui.js`.
  - Added `gambling-history` modal popup with game filter tabs (`All Games`, `Mahjong`, `Horse Racing`, `Gem Faceting`, `Roulette`, `67 Blackjack`, `Mountain Climbing`), pre-selecting whichever game the user launched it from.
  - Formatted completed round cards with game badge, round ID, timestamp, outcome summary (Tsumo/han/points, Roulette bet/pocket, Climb height/moves, Blackjack result/hands, Gem brilliance/fractures, Horse race winner/tickets), stake, payout, and net credits profit/loss.
  - Implemented pagination controls (`← Previous`, `Page X`, `Next →`).
  - Added `Pachinko.prototype.history(player, game, page)` in `src/pachinko.js` querying `gambling_rounds` for completed rounds, with endpoint `GET /api/gambling-history` in `src/worker.js` and demo fallback in `public/demo-features.js`.
- Checks run and results: `node tools/check.mjs` (209 files passed), `node --test tests/pachinko.test.mjs` (8/8 passed), `node --test tests/*.test.mjs` (440/440 passed), `git diff --check` (clean).
- Runtime deployment version / live verification: Deployed to Cloudflare Worker `amqtours-gatcha` version **00824c08-6137-4a6e-a5aa-520ae0d7fba1**. Verified live read-only: `/api/health` (200, `{"ok":true}`), `/gambling-history-ui.js` (200), `/api/gambling-history` (401 unauthorized for guest). No data operations.
- Integration owner / deployment owner: Gemini.

## Previous Task — Remove New Cards (24h) Tab in Card Catalogue

- Gemini owns implementation/commit: `public/recent-cards-ui.js`, `tests/recent-cards.test.mjs`, `docs/collaboration/STATUS.md`.
- Base SHA: `25e9f93`
- Other collaborator's work to preserve: Codex's anime appearance metadata task (`src/collection.js`, `src/tenrai-catalog.js`, `src/jikan.js`, `src/jikan-import.js`, `src/engine.js`, `src/worker.js`, `public/host.js`). No overlapping backend files edited.
- Completed behavior / decisions:
  - Removed `<button class="tab" data-action="catalog-recent">New Cards (24h)</button>` from `catalogueTabs` in `public/recent-cards-ui.js`.
  - The Card Catalogue navigation now renders only `Characters | Seiyuus | Both` tabs without the temporary scraping progress tab.
  - Underlying scan and recent import store methods remain intact for historical queries and diagnostics.
- Checks run and results: `node tools/check.mjs` (208 files passed), `node --test tests/recent-cards.test.mjs` (4/4 passed), `node --test tests/*.test.mjs` (439/439 passed), `git diff --check` (clean).
- Deployment note: Ready for review and deploy when requested.

## Completed Task — Anime Appearance Metadata; Background Pass Running

- Codex runtime source **be1a5dec48f20f6518b4149033c428a3e3b822f0**, pushed and deployed from a clean Git archive to original Worker **343dc5b5-0475-413c-aeec-d89b1ea44786**. Later Gemini trade UI commits/deployment below are descendants and retain this implementation. No overlapping code was discarded or bundled into Codex's release.
- User-approved representative rule: Main-role appearances first, then highest MAL anime member count; Supporting fallback and stable MAL ID tie-breaker. All explicit anime appearances now count toward anime search/checklists/completion. Same card identity across seasons; no added inventory copies. Community cards and host name/image/role edits retained.
- Additive appearance/scan tables and catalogue search metadata; legacy primary fallback avoids a mass startup migration. Collection queries push card/series filters into indexed branches. Local250,000-row benchmark: about3ms/page, no full association scans; not a live guarantee.
- Checks:437 Node tests in the exact committed snapshot,208 syntax checks,Wrangler dry-run,diffchecks; exact-source application and demo CI passed. Hostasset200 exactbytes,health200,anonymous start401.
- After deferred runtime adoption, started the authorized enrichment once using scoped Idempotency-Key (saved privately in work/anime-enrichment-live-proof.json). It shares the existing single-request lease,30-second completion spacing,Retry-After/backoff/budget and pause/resume controls. Original discovery remains completed at30,759anime; favorites checkpoints preserved. Do not restart/replay this pass.
- Live verified Yoshika remains mal-character-7626, now primary StrikeWitches, with unchanged portrait/favorites/rarity; existing MAX/protection/wishlist/pins visible. Existing owned card counts in TV,TV2,Movie,OVA collections. Roster totals26,33,29,12 respectively after cast enrichment. All ten Yoshika appearances from the verified upstream profile are indexed, including RoadtoBerlin, LuminousWitches and WorldWitches. Priority pass completed in20requests with no errors; full catalogue enrichment continues automatically. No economic/player QA mutations.
- Full catalogue metadata backfill is **not complete**: approximately11days at current cadence before outages/favorites overhead. It runs on Cloudflare with the PC off. Host Catalogue panel shows separate Anime Appearances progress. Tenrai documents no multi-anime cast batch; each cast request already returns all characters.
- Evidence:work/ANIME-APPEARANCES.md,anime-enrichment-live-proof.json,anime-enrichment-live-checks.json,clean test/deploy logs. Screenshots outputs/AMQTours-representative-anime-live.png and AMQTours-anime-appearances-live.png. Native checklist popup visual QA could not be confirmed in IAB; its response content and progress were verified, and engine checklist tests pass.
- No further code/deployment task is pending for Codex; let the running checkpointed pass continue. Preserve all subsequent player activity and original GAME/Game/amqtours-economy-v1.

## Previous Task

- Completed (committed, pushed, and deployed to live Worker): Trade Usability (Picker Sizing, Protected Toggle & Hide Completed Offers).
- Agent / branch / checkout path: Gemini / `main` / `c:\Users\USER\Documents\Codex\2026-10-24\tldr-i-want-to-make-a-3\outputs\AMQToursGatcha`
- Base SHA / runtime SHA / changed files: `7426256` → runtime `b0a2ce2` / `public/app.js`, `public/demo-features.js`, `public/features.css`, `public/trades-ui.js`, `src/trades.js`, `tests/trades-ui.test.mjs`, `tests/trades.test.mjs`, `docs/collaboration/STATUS.md`
- Other collaborator's work to preserve: All title-ordering, collection-ordering, compact pinned anime, quiz search/toolbar, quiz leaderboard, notices, trade filters, pick'em features, and Codex's anime appearance metadata work.
- Completed behavior / decisions:
  - Fixed squished search bar in the trade card picker modal (`.trade-picker-filters`): gave `.search` flexible sizing (`flex: 1 1 200px; min-width: 180px`), constrained `<select>` width from 100% to `flex: 0 0 auto; width: auto; min-width: 140px`, and allowed responsive wrapping.
  - Added "Show Protected Cards" checkbox toggle to `.trade-picker-filters` (`#trade-picker-show-protected`), persisted in `localStorage` under `amqtours-trade-show-protected`.
  - When checked, protected cards are included in the picker grid with clear `🔒 Protected` tags and `.is-protected` styling.
  - Added "Unprotect & Offer" (or "Unprotect & Trade" when creating a listing) and "Unprotect Only" buttons to each protected card in the trade picker, which automatically unprotect the card via `/api/protect-card` and add it directly to the active offer bundle or listing draft without closing the modal.
  - Added "Hide Completed Trades" checkbox to the "Your Offers" (`view === "offers"`) view alongside "Your Trade Listings", persisting the choice across views in `localStorage` (`amqtours-trade-hide-completed`). In `view === "offers"`, checking it filters for active, non-completed/non-cancelled trades (`l.status='open' AND mine.status='open'`).
- Checks run and results: `node tools/check.mjs` (208 files passed), `node --test tests/trades-ui.test.mjs tests/trades.test.mjs` (24/24 passed), `node --test tests/*.test.mjs` (439/439 passed), `git diff --check` (clean).
- Commit / push / CI status: Committed (`b0a2ce2`) and pushed to `origin/main`.
- Runtime deployment version / live verification: Deployed to Cloudflare Worker `amqtours-gatcha` version **a38abb31-b42f-4670-a081-0aa64e14e605**. Verified live read-only: `/api/health` (200, `{"ok":true}`), `/trades-ui.js` (200 with `trade-unprotect-offer` and `view === "offers"` check), `/features.css` (200 with `trade-picker-protected-label`), `/app.js` (200 with `trade-unprotect-offer`).
- Data operations performed / idempotency evidence (or none): None. No production test accounts, quiz attempts, bets, grants, refunds or resets. Original economy, player activity and catalogue/import checkpoints preserved.
- Remaining work / blocker / exact next action: None. Handed off cleanly.
- Integration owner / deployment owner: Gemini.

## Last Verified Application Release

- Original Worker **a38abb31-b42f-4670-a081-0aa64e14e605**, deployed from runtime commit **b0a2ce2** (`Add Hide Completed Trades toggle to Your Offers in Card Trades`), on top of `7426256` and `4d66c29`. Fixes squished trade picker search bar, adds Show Protected Cards toggle and Unprotect & Offer actions in the trade picker, and adds Hide Completed Trades checkbox to Your Offers. Live read-only checks: health 200, trades-ui.js 200, features.css 200, app.js 200. No data operations.

- Completed (committed, pushed, and deployed to live Worker): Hide catalogue scraping progress bar when import has reached 100% or is complete.
- Agent / branch / checkout path: Gemini / `main` / `c:\Users\USER\Documents\Codex\2026-10-24\tldr-i-want-to-make-a-3\outputs\AMQToursGatcha`
- Base SHA / runtime SHA / changed files: `ac7e2ca` → runtime `0a0486f` / `public/catalog-progress.js`, `tests/avatar-market-progress.test.mjs`, `docs/collaboration/STATUS.md`
- Other collaborator's work to preserve: All title-ordering, collection-ordering, compact pinned anime, quiz search/toolbar, quiz leaderboard, notices, trade filters, pick'em features, and Codex's anime appearance metadata work.
- Completed behavior / decisions:
  - Updated `catalogProgressHTML(p, escape, number)` in `public/catalog-progress.js` to return `""` when `!p || p.complete || p.percent >= 100`.
  - When the catalogue scraping reaches 100% completion, the progress bar section is omitted across all catalogue surfaces (`catalogue()` and `ui.catalogRecent`), avoiding empty containers or visual clutter.
  - Scan state tracking, server counters, host tools diagnostics, and import state are preserved unchanged.
- Checks run and results: `node tools/check.mjs` (207 files passed), `node --test tests/avatar-market-progress.test.mjs` (7/7 passed), `git diff --check` (clean).
- Commit / push / CI status: Committed (`0a0486f`) and pushed to `origin/main`.
- Runtime deployment version / live verification: Deployed to Cloudflare Worker `amqtours-gatcha` version **2944c8be-cce3-43af-ab84-05cc62ddbe62**. Verified live read-only: `/api/health` (200, `{"ok":true}`), `/catalog-progress.js` (200 with `p.percent >= 100`).
- Data operations performed / idempotency evidence (or none): None. No production test accounts, quiz attempts, bets, grants, refunds or resets. Original economy, player activity and catalogue/import checkpoints preserved.
- Remaining work / blocker / exact next action: None. Handed off cleanly.
- Integration owner / deployment owner: Gemini.

## Last Verified Application Release

- Original Worker **2944c8be-cce3-43af-ab84-05cc62ddbe62**, deployed from runtime commit **0a0486f** (`Hide catalogue scraping progress bar when import is complete`), on top of `ac7e2ca`. Hides catalogue scraping progress bar across Catalogue views when scraping reaches 100% or is marked complete. Live read-only checks: health 200, catalog-progress.js 200 with `p.percent >= 100`. No data operations.

- Original Worker **7d637bc3-2fcc-4df3-a660-6520f2e2f104**, deployed from runtime commit **c5626be** (`Add Hide Completed Trades filter in Your Trade Listings`), on top of `21f0ea1`. Adds "Hide Completed Trades" checkbox to Your Trade Listings, filtering out completed/cancelled trades and persisting preference in localStorage. Live read-only checks: health 200, trades-ui.js 200, app.js 200. No data operations.

- Original Worker **8e8f5649-0596-4fd4-b878-f5402c1512a9**, deployed from runtime commit **e44367d** (`Make pinned anime cards more compact`), on top of `60f8541`. Compacts pinned anime tiles (180px grid, tighter padding, smaller fonts and margins). Live read-only checks: health 200, features.css 200. No data operations.

- Original Worker **efcb71fc-56d5-46fe-8138-89c6b8d7ba6c**, deployed from runtime commit **60f8541** (`Add profile collection filter/sort/arrange and unify rounded tab toggles`), on top of `44893a9` and `1335f2e`. Adds `Characters | Seiyuus | Both` toggle, search, rarity/role filters, sorting, and owner-only drag-and-drop `Arrange Collection` (`collection-order` saving `inventory.position`) to `My Profile -> Collection`, and unifies rounded `.tab` pill styling across `<a class="tab">` and `<button class="tab">`. 434 Node tests, 207 syntax checks and diff check passed. Live read-only checks: health 200; `styles.css`, `profile-cards-ui.js` 200. No data operations.

- Original Worker **f46ebd11-ce00-4865-a327-ae0b1602d9b4**, deployed from runtime commit **1335f2e** (`Organize quiz list toolbar and color search box by match state`), on top of `2955ac6` and `7cfc2c2`. Reorganizes quiz header/toolbar layout to add generous spacing and bottom border above quiz grid, and colors the search input green on match and red on no match. 433 Node tests, 207 syntax checks and diff check passed. Live read-only checks: health 200; `quiz-ui.js`, `features.css` 200. No data operations.
- Previous: Original Worker **918d7568-c724-4366-80e0-9578da420e6a**, deployed from runtime commit **2955ac6** (`Add quiz name search bar to Quiz browsing`).
- Previous: Original Worker **9db62aca-f364-4d5b-8ec5-aa81c764da54**, deployed from runtime commit **7cfc2c281321b4f752e562779dcdc8446872500f** (building on **f4482ad9daacac132976cc7a372d768d8994c5c3** and **06417ac04c02218dec3e8d287aba63926236a9f7**). Same GAME/Game/amqtours-economy-v1, configuration and import state; no live resets, grants, votes, refinements or title saves.
- Quiz leaderboard highlights the signed-in viewer's row (`tr.is-me`), and when the viewer has a completed score outside the Top 20, appends a highlighted 21st row (`tr.is-me.is-outside-top`) showing exact placement (`me.rank`), score (`best / 20`), and time taken.
- My Profile → My Titles: mouse/touch drag handles, keyboard arrows/Home/End, Reset Changes and Save. Host is fixed above earned titles. Mixed quiz/card order persists independently of visibility; duplicate card awards remain distinct. Ownership, exact earned set and stale-order validation precede writes; old visibility-only clients preserve order. New awards append. The additive order table follows canonical identity migration and existing gameplay reset behavior; no reset was executed.
- Included 06417ac behavior: Song List pop-up/metadata endpoint, displaced quiz #1 notice, and participated-only pick'em tag.
- Clean release: **432 Node tests**, **207 syntax checks**, Wrangler dry-run and diff checks passed.
- Browser disposable local fixtures: actual pointer drag, keyboard movement, hidden-selection preservation, saving/reload, duplicate awards, Host pinned, narrow layout without horizontal overflow. Local screenshot: outputs/AMQTours-title-order-preview.png in surrounding workspace.
- Live: eight changed assets 200 and exact release bytes; health 200; guest My Titles 401. After default deferred code adoption, published quiz-songs 200 with 27 metadata-only entries/no raw audio. Existing signed-in browser My Titles showed enabled Save, 2 handles and no rollout notice; read-only verification only. Live screenshot: outputs/AMQTours-title-order-live.png.
- Evidence: work/TITLE-ORDER.md, title-order-live-assets.json, title-order-runtime-proof.json, title-order-ci.json and clean release test/deploy logs in the surrounding workspace.

## Work Ownership

No concurrent feature task is claimed. Before overlapping work, record each task's agent, branch/check-out path, base SHA, file scope, integration owner and deployment owner. Agree on ownership before editing shared files. A status row is advisory, not an atomic lock.

## Next Handoff Template

Copy and replace this section when work changes:

```text
Task / user request:
Agent / branch / checkout path:
Base SHA / changed files:
Other collaborator's work to preserve:
Completed behavior / decisions:
Checks run and results:
Commit / push / CI status:
Runtime deployment version / live verification (or not deployed):
Data operations performed / idempotency evidence (or none):
Remaining work / blocker / exact next action:
Integration owner / deployment owner:
```

Keep private player evidence, tokens and credentials in appropriately protected local records, never in this tracked file.
