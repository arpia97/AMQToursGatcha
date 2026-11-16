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

- Explicit owner-authorized credit recoveries may create negative wallets. Credits/refunds/sales then pay down the debt normally; ordinary spending must still leave a nonnegative balance. The AKINO-only retirement route migrates the legacy balance CHECK transactionally, preserving every account field and index. It is never a startup migration or automatic replay.
- Starting credits: 5,000. Daily credits: 300, explicitly claimed. Daily pack: five cards, explicitly claimed with Character/Seiyuu choice. Separate claim records reset at midnight Asia/Seoul. Refreshing must not claim either reward.
- Main navigation: Overview, My Profile, Card Packs, Shop, Auctions, Pick'ems, Card Alchemy, Catalogue, Pachinko, Quiz, Players, Rankings. My Collection is inside My Profile. Public player profiles also have a read-only, paginated Collection tab for inventory cards (`Characters | Seiyuus | Both` toggle, search, rarity/role filters, and sorting by custom order, collection date, rarity, enhancement, copies, alphabetical, or role), plus owner-only drag-and-drop `Arrange Collection` (`collection-order` action storing `inventory.position`); Listed remains separate. Card Size is one compact top-bar control immediately left of Anime Titles.
- Compact dark UI, title case for headings/navigation/dialogs, source/player spelling preserved. No gender filters. Characters can have Main/Supporting roles; seiyuus do not use that classification.
- Rarity order: D, C, B, A, S, SS, SSS, Ubers, AG. MAL favorites rank characters and seiyuus separately, using cumulative top cutoffs 40%, 20%, 10%, 5%, 2.5%, 1%, 0.5%, 0.1% respectively from C through AG; D is the remaining 60%. Ties share a tier. Preserve manual fixed-rarity cards.
- Normal packs cost 500; premium packs cost 1,000. Each has five draws with replacement. Normal draws are uniform within the chosen type; premium doubles the full S-through-AG range by taking extra probability from D. Full opening animation is the default. Multi-pack pagination and fresh-card Protect/Showcase actions exist.
- Enhancement maximum is Lv. 6 / MAX. Additional copies consumed at each step are 1, 2, 3, 4, 5; total investment by level is 1, 2, 4, 7, 11, 16. Historical corrections used actual consumed records; never infer a new migration from an old chat example. Enhanced investment affects selling/refining and must survive escrow/transfers.
- Alchemy is the XP refinement system, replacing older fusion rules: D gives 15 XP, doubling per rarity through AG 3,840. Draw costs D 50, doubling through AG 12,800. Normal rates 90% / 9% / 1% for 1× / 2× / 5× XP; every sixth attempt uses 50% / 45% / 5%. Ordered material queues and lucky position matter. Target draws give the selected card exactly 50% when alternatives exist; the other half excludes it. Protected/locked cards are not fodder. Preserve confirmation and idempotency.
- Showcase starts with 30 free slots; extras cost 100 each up to 1,000 total slots. Wishlist holds up to 1,000 cards. Wishlist and showcase support ordering. Keep protection/wishlist indicators and consistent level/rarity glows. Tradeable Only includes unprotected cards or cards explicitly marked Trade; eligibility never assigns a Trade label. Manual markers are independent of protection, and locked accounts remain unavailable. Revision 2 repairs the superseded automatic labels once using retained manual Trade actions and current inventory acquisition times; never reset or replay it. Shop Sell tiles include the shared Owned/Wanted Collection view.
- Wishlist controls use the shared `wishlistButton` and existing server toggle in player marketplace, Flash/weekly shop, Sell Cards, Your Listings, trade listings/offered cards, and profile showcases, Recent Collection and Listed cards, in addition to catalogue/collections/pack results. New signed-in browsing controls use the viewer's saved wishlist even when owner status icons belong to another profile. Keep selection-only card pickers free of nested action buttons.
- Shop tier prices start at D 50 and double each tier through AG 12,800. Immediate sell pays half the shop tier price times invested copies. Player listings set their own prices. Sales, gambling payouts and refunds do not inflate cumulative earned ranking.
- Current community auctions use 12-hour clocks refreshed by valid bids, with a minimum 10% increase. Flash Shop alternates three hours open and three hours closed, using a persistent cycle. New S-or-higher stock receives fixed whole-percentage discounts from 0% to 50%, weighted by 51 minus the discount percentage. Original prices and discount percentages are stored per slot and shown alongside discounted prices. Preserve the already-applied market transition and existing timers; a deployment is not a reset request.
- User auctions also require `ceil(current bid × 1.10)` after the opening reserve; fixed-price buyouts remain available. Sellers cannot bid on or buy their own auction, including bids at/above buyout. Authenticated `GET /api/notices?auctions=ID,...` optionally adds a balance/lot snapshot bounded to 64 IDs. The visible auction page or an open bid dialog polls this lightweight data about every five seconds; elsewhere notifications remain at 30 seconds, with hidden tabs/active quizzes paused. Outbid prices/refunds update without a full-state fetch or page reload. Bid dialogs read fresh data on open and patch their minimum/balance without replacing custom input; late reads after account/state changes are ignored. Existing auction durations and anti-sniping rules are unchanged.
- Current Pick'ems are tour-winner selections from host-provided teams. Default winner reward is 500 per eight players (four players per submitted team, rounding partial groups up): 8/16/24/32 players yield 500/1,000/1,500/2,000. The creation form updates from the team list until the host overrides it; existing entries retain their rewards; default voting window is 15 minutes, reopen default five minutes for eligible unsettled entries. Clicking a graph selection autosaves. Settled cards show the `Participated` tag only when the current signed-in viewer participated (no `Did Not Participate` tag); guests show no participation tag. Legacy match/score records remain supported.
- Quiz browsing has a `Search Quizzes…` box beside the Singers/Composers tabs that filters the active category by quiz name (case-, accent- and punctuation-insensitive, client-side only; completion counts still cover the whole category), and sorts by recent update, alphabetical name, unplayed first, pool size in either direction, or performance in either direction, within each category, and each quiz exposes a `Song List` button next to `Play Quiz →` that opens a read-only pop-up of the quiz's song pool (`#`, `Song`, `Artist`, `Anime`) without exposing raw audio URLs. Quiz has Singers/Composers, 20-song runs, 20-second questions, stop/restart, EU/NAE/NAW audio and optional competitive session caching. Rewards use personal-best improvements and one-time milestones. Leaderboard score ties use fastest elapsed time, then earliest achievement; older untimed records retain their documented fallback. Quiz leaderboards always highlight the signed-in viewer's row (`tr.is-me`), and if the viewer has a completed score outside the Top 20, append a highlighted 21st row (`tr.is-me.is-outside-top`) showing their exact placement (`me.rank`), best score, and time taken. When a player's `#1` leaderboard score or speed tiebreak on a published quiz is beaten by another player, the displaced `#1` player receives a `quiz-leader-beaten` notification pop-up with a direct shortcut to that quiz's leaderboard (preview runs never notify). Hosts can manage pools and draft previews. Keep answers and rewards server-authoritative. Audio cleanup releases retired decoders/listeners; failed playback gets one fresh direct-source fallback without changing the server deadline. Competitive MP3 blobs use audio/mpeg; genuine autoplay blocking keeps Enable Audio. Timed quiz moves bypass global market/starter/alarm housekeeping. Quiz requests have a 12-second client deadline, stable retry keys and saved-answer reconciliation; completion metadata refreshes never block the result screen.
- Pachinko has Mahjong, Horse Racing, Gem Faceting, Roulette, Mountain Climbing and 67 Blackjack. Consult each game module for current fees, scoring, odds and payout rules; do not restore retired coin-flip behavior from older requests.

## bop XP

Public and own player profiles have a Quiz tab after Listed. It counts one saved best score per published quiz, max scores, average score, current leaderboard #1s, and average saved best time excluding untimed records. The #1 list includes quiz name, category, score and time, with shortcuts to the existing leaderboard. Drafts, removed quizzes, unfinished attempts and retries do not inflate totals. A gold/opal title style for 20/20 in strictly less than 60 seconds is preview-only pending approval; existing title styles remain in production.

Alchemy has a separate per-player bop XP balance, using the existing square bop card image. A normal XP draw that misses its saved valid target earns 10% of the actual normal XP cost. Hits, untargeted draws and guaranteed bop draws earn none. Spending bop XP equal to the tier's normal cost guarantees the saved target at Level 1 and does not spend normal XP. The shared alchemy version/transaction receipt protects both pools. Identity migration and gameplay resets include bop XP. All player-facing uses of bop stay lowercase. Guaranteed confirmation is "Do you really want to bop this card?" / "bop" / "nope".

Both draw controls remain clickable without a target to show explicit warnings. Normal random draws require the warning/cost confirmation; insufficient XP disables payment. bop's no-target dialog cannot submit a draw and offers Choose Target. Once a target exists, unaffordable draws remain disabled and all server validation still applies.

The owner-approved historical target-miss backfill is a one-time owner-operated /api/host/bop-xp-compensation operation, ID bop-target-miss-backfill-2026-11-15-v1, stored separately from the older normal XP compensation under its own alchemy_compensations row. It is never applied at startup or on a player request. It uses historical receipt targets/costs, excludes recorded reset/reverted activity and live draws that already carry bopXPGained, rejects ambiguous history/source changes, and adds to current bop balances without changing normal XP, credits, inventory or past records. Preserve its receipt after execution; never replay older resets/recoveries/compensations.

Both draw buttons warn if no target is saved. Normal XP random draws remain possible after review; bop requires a target. The one-time historical target-miss compensation bop-target-miss-backfill-2026-11-15-v1 completed on November 15: 337,310 bop XP across 122 players, excluding reset/reverted history. Never replay it; GET the owner receipt when auditing.

## Competitive Quiz Session Path

New competitive runs preload pool audio and use one small SQLite QuizSession actor per run for ready/lock/reveal/Next. Game retains setup, resume, stop/restart and final transactional rewards. See QUIZ.md. Preserve QUIZ_SESSIONS / QuizSession and the additive v3-quiz-sessions migration alongside the original economy and QuizLibrary. Answers remain server-only until locked; this is online verification, not an encrypted offline answer key. Buffered Next may start locally before acknowledgment; all score/timing/reward authority stays on the server. Cookie-bound HMAC tickets are verified before routing to actors. Do not log tickets or secret keys. No past rewards/scores are changed.

## November 15 Settings and UX Integration

- Settings includes pack auto-sell, balance/earned privacy, collection privacy and six customizable quiz shortcuts (skip, restart, stop, play, focus and song list). Next Song remains fixed to Enter; stale custom Next values are ignored.
- Auto-sell is opt-in and applies only to pack pulls (daily included), strictly below a recognized selected rarity. Unknown/Pending rarities are retained. Payouts use Lv. 1 immediate-sale values, are transactional/retry-safe and do not increase earned credits. Shop/auction/trade acquisitions are unaffected.
- Private balances/earned totals are hidden from other viewers and credit rankings. Private collections hide inventory and ownership-derived wishlist/progress data. Owner views remain available. Avatars, explicitly showcased cards, wishlists, pins and active listings remain public; private pinned anime omit ownership counts/progress.
- Losing pick'em predictions receive 100 participation credits at settlement (legacy match and tour winner modes); non-voters receive none. No past settlements are recalculated.
- User-auction bids with less than five minutes remaining extend the end to five minutes after that bid. Community auctions retain their separate rolling twelve-hour clock.
- Recent activity uses ledger entries as authoritative credit movement; card-trade completion is informational, since credits entered escrow at offer time. Completed history reads the newest 25 per participant through indexed seller/proposer branches, with batched bundles and card names.
- Pack results show remaining credits and auto-sold totals, and quantity is bounded by current affordability. Collectors access/counts, live pick'em countdowns, trade board/picker filters and wishlist card-type filters are included.

## Quiz and Pick’em Timing

Quiz anime labels in Song List, Correct Answer and Songs Played follow the site's English/Romaji preference through `public/quiz-title-display.js`. The static `quiz-anime-titles.json` contains only labelled anime names and aliases, loaded once on Quiz entry. Rebuild it with `node tools/build-quiz-title-names.mjs` when changing the bundled AMQ master; the existing answer-refresh tool updates both. Missing translations fall back to the other main name; unknown/ambiguous aliases retain the source label. Display translation never changes accepted answers, submitted text, scoring or saved quizzes.

Quiz countdowns advance from a monotonic clock using the lowest-latency server sample, so slower/out-of-order responses and device wall-clock changes do not pull the timer behind. The Worker stamps quiz answers only after receiving the complete bounded body, overwriting any client timestamp header. Scoring and response duration use that trusted arrival time, so database queue delays do not expire on-time answers; questions remain 20 seconds with the existing one-second arrival grace. Client-supplied body timestamps never control scoring. Quiz receipt replays return a fresh server clock sample while preserving the saved run/rewards. Answer receipts retain the trusted arrival time for diagnostics. Existing scores/rewards are not recalculated.

Host Pick’em editors expose Extend Time and Close while voting is open, and Reopen when closed (five minutes by default, editable). Extensions add to the current deadline; reopening starts from now. All keep picks and rewards unchanged. Timer-only updates tolerate new votes but reject stale deadline/configuration edits and settled outcomes. Receipt retries never apply an extension twice.

## Tour Credit Review

Participation is per round: up to 16 players = 200; 24 = 300; 32 = 400. Pasted result/signup lists resolve aliases to canonical IDs. Review infers the smallest supported 8/16/24/32 capacity containing the roster. Default maximum rounds: 8 players → 3; 16 → 6; 24/32 → 5. Hosts can edit the maximum and reduce individuals' played rounds. Subs come from the whole registry and split the original slot's rounds. Count and Report checkboxes each pay a flat 750 once per player/category/tour; outside helpers can have zero participation. The review preserves team/result order, keeps subs with their outgoing player and includes participant search. A 1× default credit multiplier (0.1×–10×, tenths) scales all batch categories, including Count/Report and outside staff. Reward protocol v3 rejects older reviews; the server recomputes amounts and audits the multiplier atomically with duplicate/retry protection. Manual grant/deduction search caches normalized names/aliases and caps displayed options at 100 while searching the full registry. Do not recalculate past awards on deployment.

## Anime Appearance Metadata

Character cards have one representative anime, chosen from Main-role appearances by highest MAL member count (Supporting only as fallback; MAL ID breaks ties). Collection checklists/progress include all explicitly credited anime appearances, not just the representative. Secondary titles are searchable, one card identity counts once per anime, existing pins/ownership are preserved, and manual community cards retain their source. A separate resumable appearance pass repairs links discarded by the old importer; it does not restart discovery. See IMPORTER.md.

## Importer and Sheet Sources

Tenrai serves cached MAL data; this app does not directly HTML-scrape MAL. Current source has one upstream request at a time, at least **30 seconds between completed requests**. Discovery and favorites share that scheduler, persisted leases/checkpoints and conservative retry/backoff. `TENRAI_SERVER_KEY` is a runtime secret on the original Worker; never read or reproduce its value in context. Paid deployment uses `BACKGROUND_IMPORT_MODE=continuous`; this does not bypass upstream rate limits. Favorites refresh every 15 days after the preceding scan completes. Browser/PC shutdown does not stop Durable Object alarms.

Do not reset cursors, bypass cooldowns, launch concurrent catch-up fetches or mass-upload historical data to “fix” a stall. Check current host diagnostics and checkpoint advancement before claiming progress. `IMPORTER.md` and actual `INTERVAL` in `src/jikan-import.js` supersede the older ten-second description in parts of `CATALOG.md`.

The host's displayed source-sheet link changed to spreadsheet `1xsBfuz1v-gYgv5KEbEFlyQBoz_R5aJ84W6gscUF0-Hc`, gid `2012584445`. **Alias synchronization deliberately still uses** spreadsheet `1ihfqssregh74curDyvRE0GAFihQfovUAHpYDrtOIrOA`, gid `1903970832`, every six hours. They are different sources; do not change the alias importer to match the display link.

## Reading Older Documentation

`README.md`, `HOST-TOOLS.md`, `QUIZ.md`, `IMPORTER.md`, `CATALOG.md`, `DEPLOY.md` and game docs contain useful feature detail, but some onboarding passages are historical. In particular, free-plan setup, shared beta registration codes, all-actions-owner-only access and ten-second importer pacing are not current deployment instructions. Consult current source/tests and the latest explicit user decision. Explain an unresolved discrepancy instead of silently reviving an old rule.

## Secondary Quiz Song Cache

Host quiz upload review runs an automod summary for broken/unverified audio links and duplicate song titles (Unicode width/case/whitespace normalized). Duplicates are advisory, with original row references; shared anime answers are not treated as duplicate songs. Append mode compares the retained current pool, excluding selected removals and identical audio merged on save. Skipping/restoring songs or changing import mode refreshes warnings. Saved pools also expose Run Automod · Check Links without re-upload; no scan is triggered by ordinary player visits. Explicit rechecks bypass both success and failure audio caches while retaining bounded batches and network validation. Song/Artist/Anime headers sort both upload review and saved-pool tables, retaining original row/action IDs, checked removals, stable ties and missing values last.

AMQ Plus/AnisongDB supplied seed:38194records/38200IDs. Host-uploaded AMQ JSON names/working answers take priority. New independent `QUIZ_LIBRARY`/`QuizLibrary` actor named `quiz-song-library-v1` stores versioned metadata only, leaving original Game/economy untouched. Host Quiz controls refresh metadata in400-ID batches at least30seconds apart, pause/resume/cancel, and explicitly sync a selected quiz’s fallback answers. Player visits do not trigger upstream refresh. Seed assets are sharded; never copy/parse the raw98.7MiB masterlist in a Worker. Existing exported-answer songs and active-run snapshots are protected by sync. See QUIZ.md; the larger-pool random quiz mode remains future work.
