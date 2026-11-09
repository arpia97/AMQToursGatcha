# Shared Status and Handoff

Updated November 10, 2026, Asia/Seoul. This file is a coordination record; Git and deployment evidence must still be checked at task start.

## Current Task

- Completed (committed and pushed; awaiting explicit deploy instruction): Add `Characters | Seiyuus | Both` filter toggle, search, rarity/role filters, sorting, and drag-and-drop `Arrange Collection` (`collection-order`) to `My Profile -> Collection`, and unify rounded `.tab` / `.tabs` toggle styling across anchor and button tabs.
- Agent / branch / checkout path: Gemini (Antigravity) / `main` / `c:\Users\USER\Documents\Codex\2026-10-24\tldr-i-want-to-make-a-3\outputs\AMQToursGatcha`
- Base SHA / runtime SHA / changed files: `44893a9` / `public/styles.css`, `public/features.css`, `public/app.js`, `public/card-display.js`, `public/profile-cards-ui.js`, `public/showcase-order.js`, `public/wishlist-order.js`, `public/features.js`, `public/demo-features.js`, `src/engine.js`, `src/economy.js`, `src/economy-repair.js`, `src/wishlist.js`, `src/worker.js`, `tests/wishlist.test.mjs`, `tests/showcase-order.test.mjs`, `docs/collaboration/PROJECT.md`, `docs/collaboration/STATUS.md`
- Other collaborator's work to preserve: All title-ordering, quiz search/toolbar, quiz leaderboard, notices, and pick'em features.
- Completed behavior / decisions:
  - Added `Characters | Seiyuus | Both` toggle, search input, `Sort By` (`Custom Order`, `Collection Date · Newest`, `Rarity · Highest First`, `Enhancement · Highest First`, `Most Copies`, `Alphabetical · A–Z`, `Alphabetical · Z–A`, `Role · Main First`), Rarity filter, and Character Role filter to `My Profile -> Collection` (`player-cards?view=collection`).
  - Added owner-only `Arrange Collection` toggle (`GET /api/collection-order` + `POST /api/collection-order` saving `inventory.position` with `expectedCards` 409 conflict validation) using the same drag-and-drop / position-input / quick-sort card grid editor as Showcase and Wishlist, plus inline Character/Seiyuu/Rarity/Role filters while arranging.
  - Added `border-radius: 7px` and flex alignment directly to `.tab` in `public/styles.css` (and `.tabs` container on `.listing-venues`) so `<a class="tab">` (`My Profile | My Collection | My Titles`) and `<button class="tab">` render with consistent rounded pill corners.
- Checks run and results: `node tools/check.mjs` (207 files), `node --test tests/*.test.mjs` (434/434 passed), `git diff --check` (clean).
- Commit / push / CI status: Committed and pushed to `origin/main`.
- Runtime deployment version / live verification (or not deployed): Not deployed yet (awaiting explicit deploy instruction).
- Data operations performed / idempotency evidence (or none): None.
- Remaining work / blocker / exact next action: Deploy when requested by the user.
- Integration owner / deployment owner: Gemini (Antigravity).

## Last Verified Application Release

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
