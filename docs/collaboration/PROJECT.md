# Project Context

Curated on November 9, 2026 (Asia/Seoul). This is a maintained engineering handoff, not a transcript or live database snapshot. Verify mutable facts against source and current deployment evidence. A new user instruction can supersede a product rule here; update this document when that happens.

## Applications and Addresses

| Application | Source / Address | Purpose |
| --- | --- | --- |
| Gatcha repository | https://github.com/arpia97/AMQToursGatcha | This repository |
| Live Gatcha | https://amqtours.app/gacha/ | Shared production economy; previous play address remains available |
| Host console | https://amqtours.app/gacha/host | Gatcha host administration |
| Original Worker address | https://amqtours-gatcha.amqtours-gatcha.workers.dev/ | Same economy; hostname-specific sessions |
| GitHub Pages | https://arpia97.github.io/AMQToursGatcha/ | Browser-only demo, separate fictional state |
| Tour host platform | https://amqtours.app/tour (source in `../AMQToursHost`) | Separate tour hosting application; see `HOST-PLATFORM.md` |

The user uses both applications. “Host panel” can mean the Gatcha console or the tour platform; infer from the requested feature and confirm only when the distinction affects the work.

## Architecture and Source Map

Vanilla browser JavaScript ES modules and CSS, with a Cloudflare Worker and one existing SQLite-backed Durable Object. This is not a React or Next.js frontend. Node's built-in test runner exercises the engine with disposable SQLite state.

| Area | Start Here |
| --- | --- |
| Routing, screen composition | `public/app.js` and focused modules under `public/` |
| Shared card UI, sizes, hover actions, glow | `public/card-surface*`, `public/card-preferences.js`, existing card render helpers and CSS |
| HTTP, authentication, Durable Object scheduling | `src/worker.js` |
| Business operations, SQL and transaction boundaries | `src/engine.js` and feature modules in `src/` |
| Credits, enhancements, host participation | `src/economy.js`, `src/participation.js`, `public/tour-rewards*` |
| Alchemy | `src/alchemy.js` and `public/alchemy*` |
| Pick'ems | `src/pickem-events.js`, `public/pickem-board.js`, `public/pickem-votes.js`, `public/tour-winner-ui.js` |
| Quiz pools, matching, audio and rewards | `src/quiz*.js`, `public/quiz*`, `QUIZ.md` |
| Marketplace, community selection, trades | `src/community-market.js`, `src/trades.js`, related engine/public modules |
| Catalogue discovery and favorites | `src/jikan-import.js`, `src/tenrai-catalog.js`, `src/jikan.js`, `src/popularity.js`, `IMPORTER.md` |
| Aliases | `src/aliases.js`, `src/registration.js`, `HOST-TOOLS.md` |
| Games | `src/mahjong.js`, `horse-racing.js`, `gem.js`, `pachinko.js`, `blackjack.js`; `PACHINKO-GAMES.md`, `RACING.md` |
| Local/demo tooling | `tools/`, `public/demo*.js`, `tests/*.test.mjs` |

Search for the current call sites before editing; filenames alone do not establish ownership of a behavior. Some compatibility modules intentionally retain old names.

## Production Identity and Data

`wrangler.jsonc` deploys Worker `amqtours-gatcha`; binding `GAME` refers to class `Game`, using named object `amqtours-economy-v1`. Keep those identifiers and the existing migration history intact. `wrangler.play.jsonc` deploys the shorter-address proxy, with no separate economy or database.

The original database contains real accounts, passwords, sessions, wallets, ledger, inventory, listings/holds, notices, quiz records, aliases, import checkpoints and catalogue. Do not replace it with demo data. Do not rerun old beta resets, account reversals, custom-card imports, XP compensation or enhancement corrections. Those were historical one-time operations, not installation steps. Any newly requested data correction needs a scoped preview, saved evidence and retry-safe receipt.

Only owner `arpia97`, canonical Tours ID `368`, grants/revokes host roles or performs owner-only actions. Explicitly appointed hosts can use delegated console functions. Matching a username or an imported admin flag does not grant authority. Old “owner only for every host action” notes are superseded.

Registration requires an individual one-use host-issued code, using the same expiring, consumed-once mechanism as account recovery. Preserve existing credentials and recovery protections. Owner-only persistent account locks block registration/login, credit rewards and economic actions; locking closes open listings and returns holds, while unlocking does not restore revoked access. Never include secret values or credentials from past conversations in this handoff.

## Current Product Rules

- Starting credits: 5,000. Daily credits: 300, explicitly claimed. Daily pack: five cards, explicitly claimed with Character/Seiyuu choice. Separate claim records reset at midnight Asia/Seoul. Refreshing must not claim either reward.
- Main navigation: Overview, My Profile, Card Packs, Shop, Auctions, Pick'ems, Card Alchemy, Catalogue, Pachinko, Quiz, Players, Rankings. My Collection is inside My Profile. Public player profiles also have a read-only, paginated Collection tab for inventory cards (`Characters | Seiyuus | Both` toggle, search, rarity/role filters, and sorting by custom order, collection date, rarity, enhancement, copies, alphabetical, or role), plus owner-only drag-and-drop `Arrange Collection` (`collection-order` action storing `inventory.position`); Listed remains separate. Card Size is one compact top-bar control immediately left of Anime Titles.
- Compact dark UI, title case for headings/navigation/dialogs, source/player spelling preserved. No gender filters. Characters can have Main/Supporting roles; seiyuus do not use that classification.
- Rarity order: D, C, B, A, S, SS, SSS, Ubers, AG. MAL favorites rank characters and seiyuus separately, using cumulative top cutoffs 40%, 20%, 10%, 5%, 2.5%, 1%, 0.5%, 0.1% respectively from C through AG; D is the remaining 60%. Ties share a tier. Preserve manual fixed-rarity cards.
- Normal packs cost 500; premium packs cost 1,000. Each has five draws with replacement. Normal draws are uniform within the chosen type; premium doubles the full S-through-AG range by taking extra probability from D. Full opening animation is the default. Multi-pack pagination and fresh-card Protect/Showcase actions exist.
- Enhancement maximum is Lv. 6 / MAX. Additional copies consumed at each step are 1, 2, 3, 4, 5; total investment by level is 1, 2, 4, 7, 11, 16. Historical corrections used actual consumed records; never infer a new migration from an old chat example. Enhanced investment affects selling/refining and must survive escrow/transfers.
- Alchemy is the XP refinement system, replacing older fusion rules: D gives 15 XP, doubling per rarity through AG 3,840. Draw costs D 50, doubling through AG 12,800. Normal rates 90% / 9% / 1% for 1× / 2× / 5× XP; every sixth attempt uses 50% / 45% / 5%. Ordered material queues and lucky position matter. Target draws give the selected card exactly 50% when alternatives exist; the other half excludes it. Protected/locked cards are not fodder. Preserve confirmation and idempotency.
- Showcase starts with 30 free slots; extras cost 100 each, within existing bounds. Wishlist and showcase support ordering. Keep protection/wishlist indicators and consistent level/rarity glows. Tradeable Only includes unprotected cards or cards explicitly marked Trade; eligibility never assigns a Trade label. Manual markers are independent of protection, and locked accounts remain unavailable. Revision 2 repairs the superseded automatic labels once using retained manual Trade actions and current inventory acquisition times; never reset or replay it. Shop Sell tiles include the shared Owned/Wanted Collection view.
- Shop tier prices start at D 50 and double each tier through AG 12,800. Immediate sell pays half the shop tier price times invested copies. Player listings set their own prices. Sales, gambling payouts and refunds do not inflate cumulative earned ranking.
- Current community auctions use 12-hour clocks refreshed by valid bids, with a minimum 10% increase. Flash Shop alternates three hours open and three hours closed, using a persistent cycle. New S-or-higher stock receives fixed whole-percentage discounts from 0% to 50%, weighted by 51 minus the discount percentage. Original prices and discount percentages are stored per slot and shown alongside discounted prices. Preserve the already-applied market transition and existing timers; a deployment is not a reset request.
- Current Pick'ems are tour-winner selections from host-provided teams. Default winner reward is 500 per eight players (four players per submitted team, rounding partial groups up): 8/16/24/32 players yield 500/1,000/1,500/2,000. The creation form updates from the team list until the host overrides it; existing entries retain their rewards; default voting window is 15 minutes, reopen default five minutes for eligible unsettled entries. Clicking a graph selection autosaves. Settled cards show the `Participated` tag only when the current signed-in viewer participated (no `Did Not Participate` tag); guests show no participation tag. Legacy match/score records remain supported.
- Quiz browsing has a `Search Quizzes…` box beside the Singers/Composers tabs that filters the active category by quiz name (case-, accent- and punctuation-insensitive, client-side only; completion counts still cover the whole category), and sorts by recent update, alphabetical name, unplayed first, pool size in either direction, or performance in either direction, within each category, and each quiz exposes a `Song List` button next to `Play Quiz →` that opens a read-only pop-up of the quiz's song pool (`#`, `Song`, `Artist`, `Anime`) without exposing raw audio URLs. Quiz has Singers/Composers, 20-song runs, 20-second questions, stop/restart, EU/NAE/NAW audio and optional competitive session caching. Rewards use personal-best improvements and one-time milestones. Leaderboard score ties use fastest elapsed time, then earliest achievement; older untimed records retain their documented fallback. Quiz leaderboards always highlight the signed-in viewer's row (`tr.is-me`), and if the viewer has a completed score outside the Top 20, append a highlighted 21st row (`tr.is-me.is-outside-top`) showing their exact placement (`me.rank`), best score, and time taken. When a player's `#1` leaderboard score or speed tiebreak on a published quiz is beaten by another player, the displaced `#1` player receives a `quiz-leader-beaten` notification pop-up with a direct shortcut to that quiz's leaderboard (preview runs never notify). Hosts can manage pools and draft previews. Keep answers and rewards server-authoritative. Audio cleanup releases retired decoders/listeners; failed playback gets one fresh direct-source fallback without changing the server deadline. Competitive MP3 blobs use audio/mpeg; genuine autoplay blocking keeps Enable Audio. Timed quiz moves bypass global market/starter/alarm housekeeping. Quiz requests have a 12-second client deadline, stable retry keys and saved-answer reconciliation; completion metadata refreshes never block the result screen.
- Pachinko has Mahjong, Horse Racing, Gem Faceting, Roulette, Mountain Climbing and 67 Blackjack. Consult each game module for current fees, scoring, odds and payout rules; do not restore retired coin-flip behavior from older requests.

## Tour Credit Review

Participation is per round: up to 16 players = 200; 24 = 300; 32 = 400. Pasted result/signup lists resolve aliases to canonical IDs. Review infers the smallest supported 8/16/24/32 capacity containing the roster. Default maximum rounds: 8 players → 3; 16 → 6; 24/32 → 5. Hosts can edit the maximum and reduce individuals' played rounds. Subs come from the whole registry and split the original slot's rounds. Count and Report checkboxes each pay a flat 750 once per player/category/tour; outside helpers can have zero participation. The server recomputes and awards atomically with duplicate/retry protection. Do not recalculate past awards on deployment.

## Anime Appearance Metadata

Character cards have one representative anime, chosen from Main-role appearances by highest MAL member count (Supporting only as fallback; MAL ID breaks ties). Collection checklists/progress include all explicitly credited anime appearances, not just the representative. Secondary titles are searchable, one card identity counts once per anime, existing pins/ownership are preserved, and manual community cards retain their source. A separate resumable appearance pass repairs links discarded by the old importer; it does not restart discovery. See IMPORTER.md.

## Importer and Sheet Sources

Tenrai serves cached MAL data; this app does not directly HTML-scrape MAL. Current source has one upstream request at a time, at least **30 seconds between completed requests**. Discovery and favorites share that scheduler, persisted leases/checkpoints and conservative retry/backoff. `TENRAI_SERVER_KEY` is a runtime secret on the original Worker; never read or reproduce its value in context. Paid deployment uses `BACKGROUND_IMPORT_MODE=continuous`; this does not bypass upstream rate limits. Favorites refresh every 15 days after the preceding scan completes. Browser/PC shutdown does not stop Durable Object alarms.

Do not reset cursors, bypass cooldowns, launch concurrent catch-up fetches or mass-upload historical data to “fix” a stall. Check current host diagnostics and checkpoint advancement before claiming progress. `IMPORTER.md` and actual `INTERVAL` in `src/jikan-import.js` supersede the older ten-second description in parts of `CATALOG.md`.

The host's displayed source-sheet link changed to spreadsheet `1xsBfuz1v-gYgv5KEbEFlyQBoz_R5aJ84W6gscUF0-Hc`, gid `2012584445`. **Alias synchronization deliberately still uses** spreadsheet `1ihfqssregh74curDyvRE0GAFihQfovUAHpYDrtOIrOA`, gid `1903970832`, every six hours. They are different sources; do not change the alias importer to match the display link.

## Reading Older Documentation

`README.md`, `HOST-TOOLS.md`, `QUIZ.md`, `IMPORTER.md`, `CATALOG.md`, `DEPLOY.md` and game docs contain useful feature detail, but some onboarding passages are historical. In particular, free-plan setup, shared beta registration codes, all-actions-owner-only access and ten-second importer pacing are not current deployment instructions. Consult current source/tests and the latest explicit user decision. Explain an unresolved discrepancy instead of silently reviving an old rule.

## Secondary Quiz Song Cache

AMQ Plus/AnisongDB supplied seed:38194records/38200IDs. Host-uploaded AMQ JSON names/working answers take priority. New independent `QUIZ_LIBRARY`/`QuizLibrary` actor named `quiz-song-library-v1` stores versioned metadata only, leaving original Game/economy untouched. Host Quiz controls refresh metadata in400-ID batches at least30seconds apart, pause/resume/cancel, and explicitly sync a selected quiz’s fallback answers. Player visits do not trigger upstream refresh. Seed assets are sharded; never copy/parse the raw98.7MiB masterlist in a Worker. Existing exported-answer songs and active-run snapshots are protected by sync. See QUIZ.md; the larger-pool random quiz mode remains future work.
