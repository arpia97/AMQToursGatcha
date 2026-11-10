# Shared Status and Handoff

Updated November 10, 2026, Asia/Seoul. This file is a coordination record; Git and deployment evidence must still be checked at task start.

## Active Task — Anime Appearance Metadata

- Codex owns implementation/integration/deployment from base ac7e2ca: src/collection.js, src/tenrai-catalog.js, src/jikan.js, src/jikan-import.js, related existing tests and documentation. Store all character/anime appearances and choose representative anime deterministically; preserve card IDs/ownership, manual cards, favorites/checkpoints and the original economy.
- Existing uncommitted public/catalog-progress.js and tests/avatar-market-progress.test.mjs belong to another collaborator; preserve and exclude unless coordinated. No concurrent deployment authorized by this ownership note.
- Research: upstream offers anime cast lists; no explicit representative-work field. A slow checkpointed relationship enrichment pass is needed because previous importer discarded nonprimary associations.

## Previous Task

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
