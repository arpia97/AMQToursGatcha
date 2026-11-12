# Host console and external integration

The host console at `/host.html` accepts arpia97 (canonical AMQ Tours ID 368) and hosts explicitly appointed by that owner. In **Players & access → Host permissions**, arpia97 can grant or immediately revoke access for registered players. Delegated hosts cannot appoint more hosts, change the owner's role, recover privileged accounts, reverse Mahjong history, or delete the player registry. Every request checks the current session, administrator flag and explicit delegation record; changing a display name or importing an administrator flag cannot grant access. The owner-held deployment HOST_TOKEN remains available for trusted external integration/recovery.

The host menu is arranged horizontally and wraps on narrower screens. Gameplay resets preserve roles; deleting the entire player registry removes delegations. Permission changes are audit logged.

## Import AMQ identities

The backend automatically reads the public [IDs worksheet](https://docs.google.com/spreadsheets/d/1ihfqssregh74curDyvRE0GAFihQfovUAHpYDrtOIrOA/edit?gid=1903970832) on startup and every six hours. Columns A/B must be `Player Name` / `Player ID`. Rows sharing an ID become aliases for one player; the first name is the original Tours name. No Google credentials or writes are used. Players & access shows sync status and a manual **Scan Aliases** button. Temporary failures retry after 15 minutes and retain the last good registry; identity conflicts roll back the entire update.

Legacy nonnumeric account IDs migrate to a matching source alias's canonical ID only when unambiguous and the target is unused. Passwords, administrator role, sessions, credits, cards, listings, and history are preserved. Exact IDs take precedence over aliases during sign-in because the sheet contains numeric aliases that overlap other players' IDs. Enter `alias:NAME` to explicitly select an alias, or `id:ID` for an exact ID. Previously imported aliases remain reserved.

Add new players and aliases to the linked IDs worksheet, then use **Players & access → Scan Aliases**. The console reads the sheet directly; no CSV upload is needed.

IDs are strings: leading zeros are preserved. A player is identified by the stable AMQ Tours ID, never by a mutable username. Imports preserve wallets, cards, account access, username history, and previously imported aliases. Any conflict with another player's alias or username history rejects the entire import. A new authoritative AMQ alias that collides with a username needs explicit identity resolution; the importer does not reassign it silently.

New players register with an imported AMQ Tours ID or alias, a password, and an individual one-use code. Hosts issue codes under Players & Access → New Account Codes. Registration and password recovery use the same code mechanism: each code is tied to one identity, expires after seven days, and is consumed once. Host account-access reset revokes sessions while preserving gameplay; the player uses Recover account access to set a new password. This differs from the destructive **Reset tools** tab.

## Activity counts and pick’ems

Default rewards are 1,000 credits per tour participant, **300 per game counted**, and 500 per game reported. The single-player grant form switches defaults with the category; counting and reporting have a game-count field that multiplies the default amount, and hosts can still edit the final amount. API `grant` callers can omit `amount` to use the category default and supply `games` for counting or reporting (default 1). Participation paste batches also default to 1,000 per player. Existing grants are unchanged.

New tour pick’ems default to **fifteen minutes after publication**, calculated by the backend when posting. Keep “15 minutes after publishing” checked or uncheck it to set an absolute deadline. API callers can omit `ends` for the default deadline.

Daily login pays **300 credits**, still once per KST day. An already-claimed day is not paid again after deployment. Public profile/name displays show a **Host** title only for the effective owner or an explicitly delegated host; role revocation removes the title on refresh. Players can pin up to 20 anime and 20 owned spotlight cards.

When granting reporting, counting, or participation credits, include a stable **tour identifier**. Each player receives at most one profile count for each category and tour identifier, even if additional credit grants are made for the same task. Different categories count separately. The audit note is displayed in wallet activity. API callers without an event field fall back to the note as the identifier.

Profile pick’em accuracy is correct winning-team predictions divided by all **settled pick’ems that player entered**. Unresolved and skipped entries are excluded. Historical match predictions still count under their original rules. No settled entries displays `—`.

### Paste participation rewards

In **Credit rewards → Reward a whole tour**, paste team results such as `name (98.893) anothername (83.829) | Total = 182.722 | Guesses = [54]`. Choose credits per player, a unique tour identifier and an audit note, then review the resolved players and total. Ratings, totals and guesses are ignored. Matching uses the AMQ Tours alias registry, case-insensitively; multiple names for the same canonical ID receive one award. Unknown names or malformed rows block the entire operation. A successful batch records earned credits and participation counts atomically; a player cannot receive another batch participation award for that tour identifier, even with a new request key. Individual manual credit grants retain their existing behavior.

POST `participation-preview` with `{text}` returns `{players:[{id,name}]}` without awarding anything. POST `participation-batch` with `{text,amount,event,note,expectedPlayers:[canonical IDs in preview order]}` awards the reviewed batch. Use one stable Idempotency-Key for retries.

### Tour winner pick’ems

**Pick’ems → Create a tour pick’em** takes a tour name and **one team per line** (2–64 unique names). The correct-winner reward defaults to 500 credits per eight players, assuming four players per team (8: 500; 16: 1,000; 24: 1,500; 32: 2,000; partial groups round up). Editing the team list updates the default until the host manually changes the reward. Existing pick’ems keep their rewards. Keep or change this reward and the fifteen-minute deadline, then click **Publish tour pick’em**. It creates one pick’em for the whole tour. There are no schedule, match-score or exact-score reward fields.

In the public Pick’ems tab, **View teams** opens a compact team selector. Players choose the overall winning team and click **Confirm pick**. They can change their choice until voting closes. Draft selections survive collapsing the tour or refreshing the view. Only the signed-in player's choice is returned; other players' choices remain private.

After voting closes, **Post tour winners → Select winner** lets the host choose the winning team and click **Confirm winner**, followed by a final confirmation. Each correct player receives only the configured winner reward. Settlement is atomic, final and idempotent; retries cannot pay twice. **Refresh status** updates a tour whose deadline has just passed.

**Edit or delete published pick’ems → Manage tour** edits its name, team list, reward and deadline. Changing team membership requires explicit permission to clear existing picks; other edits preserve them. An existing locked deadline can be retained, or a future deadline can reopen voting. Typed deletion confirmation removes the pick’em and its picks without changing credits. Settled results cannot be edited or deleted. Stale reviews reject before changes.

Public GET `pickem-tours?page=N` returns up to 20 tour summaries; GET `pickem-tour?key=ID` returns the selected tour with only the current player's prediction. POST `/api/predict` takes `{pickem,winner:teamName,expectedTeams:teamsJSONString}`. Reuse the exact `teams` string from the returned pick’em to reject a stale team list.

Host POST `pickem-winner` takes `{name,teams:[names],winnerReward:1000,ends?:epochMilliseconds}`; `teams` also accepts newline-separated text. Host GET `pickem-match?pickem=ID` returns a reviewed snapshot with `votes`. POST `pickem-winner-edit` takes `{pickem,expected:snapshot,name,teams,winnerReward,ends,clearPredictions:boolean}`. POST `settle` takes `{pickem,winner:teamName,expectedTeams:teamsJSONString}`. POST `pickem-delete` takes `{pickem,expected:snapshot,confirmation:"DELETE PICKEM ID"}`. Reuse a stable Idempotency-Key with the same payload after uncertain responses.

Previously published match/score pick’ems remain available under their original rules and retain their existing predictions, deadlines, paid results and reward amounts. Their old compact tables and host result/edit/delete controls are kept for that history. The compatible `pickem`, `pickem-edit`, `pickem-event`, `pickem-swiss-round`, `pickem-combine`, `pickem-event-edit` and `pickem-event-delete` endpoints remain available to existing tools; the browser creates only tour-winner pick’ems.

POST `permissions` takes `{player,enabled:boolean}` and is owner-only; it cannot change ID 368.

### Protected cards and batch sales

Player card Actions include **Protect**, directly after Showcase. Protection covers all currently held copies of that card and survives new pulls, enhancement, sign-ins and deployment. It blocks instant sale, marketplace/auction listing and fusion. It does not withdraw previously escrowed listings. Enhancing keeps the base card and remains available.

**Shop → Sell cards** supports combined type, search, rarity, role and upgradable filters. Review a batch of spare copies (keeping enhanced bases) or all matching copies. All matching pages are considered, up to 200 distinct card types per transaction. Protected cards are always excluded. Review shows counts and exact credits, including enhancement investment. Any changed inventory, protection, rarity or price rejects the whole stale sale. Sold final copies clear avatar/showcase references. Sales never increase earned-credit rankings.

POST `/api/protect-card`: `{card,protected:boolean}`. POST `/api/sell-batch`: `{filters:{kind,query,rarity,role,upgradable:boolean,mode:"extras"|"all"},expectedItems:[...]}`. Generate expectedItems using shared `public/card-management.js` batchSaleQuote. Both are session-protected and idempotent. My collection and the shop seller inventory have an **Upgradable only** checkbox using the real next-level duplicate requirement and maximum level 20.

## Terminal tool

Set `AMQ_HOST_TOKEN` in the environment, from a secure local source. Do not place it in a JSON payload, command argument, or committed file.

Create `grant.json` locally:

```json
{
  "player": "00123",
  "amount": 300,
  "reason": "reporting",
  "event": "usual-2026-10-24-42",
  "note": "Usual #42 reporting"
}
```

Then run:

```sh
node tools/host.mjs grant grant.json --url https://YOUR-WORKER.workers.dev --key usual42-reporting-00123
```

Reuse the **same key and exact payload** for a retry. A key reused with a different payload is rejected. Choose different keys for different intended grants. Generated request IDs are printed by the tool so they can be reused after a network interruption.

Your existing AMQ Tours Python script can call the same HTTPS JSON endpoint directly. Send `Authorization: Bearer <token>`, `Content-Type: application/json`, and `Idempotency-Key: <stable unique operation ID>`. Keep the token in a local secret, never in the sheet or player frontend. No changes have been made to the existing host script.

## Host endpoints

All paths start with `/api/host/`. GET `state` reads console data; all other listed operations are JSON POSTs.

| Action          | Body                                                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `players`       | `{"players":[{"id":"00123","name":"Example","aliases":["old"]}]}`                                                                                                                                |
| `invite`        | `{"player":"00123"}` → one-use code (valid seven days)                                                                                                                                           |
| `reset`         | `{"player":"00123"}` → revoke account access, issue new recovery code                                                                                                                            |
| `grant`         | `{"player":"00123","amount":100,"reason":"counting","event":"tour42","note":"Tour 42"}`                                                                                                          |
| `pickem-winner` | `{"name":"Usual","teams":["Team A","Team B","Team C","Team D"],"winnerReward":1000}`                                                                                                             |
| `settle`        | `{"pickem":1,"winner":"Team C","expectedTeams":"[\"Team A\",\"Team B\",\"Team C\",\"Team D\"]"}`                                                                                                 |
| `settings`      | `{"character":500,"seiyuu":500,"premium_character":2000,"premium_seiyuu":2000}`                                                                                                                  |
| `aliases-sync`  | `{}` → synchronize the configured public source; response includes status/error and counts                                                                                                       |
| `catalog`       | `{"cards":[{"id":"provider-character-123","kind":"character","name":"Example","series":"Series","role":"main","image":"https://example.com/image.jpg","source":"https://example.com/profile"}]}` |
| `reset-player`  | `{"player":"00123","confirmation":"RESET PLAYER 00123"}`                                                                                                                                         |
| `reset-all`     | `{"deleteRegistry":false,"confirmation":"RESET ALL GAME DATA"}`                                                                                                                                  |
| `reset-all`     | `{"deleteRegistry":true,"confirmation":"DELETE EVERYTHING"}`                                                                                                                                     |

Credit grant reasons: `reporting`, `counting`, `participation`, or `other`. Grants must be positive integers. Pick’em deadlines are Unix timestamps **in milliseconds**, at least one minute in the future. Settlement is allowed only after the deadline and cannot be repeated. Only combined double-round-robin matchups accept a 1:1 split; individual and Swiss matches still require a winner.

Catalog imports through the host API accept 500 entries per request. Reimporting an existing ID updates metadata and does not create a new card. The browser's manual JSON/sample import section has been removed; Tenrai discovery and favorite scans remain available. Character role is `main`, `supporting`, or `unknown`; missing character role defaults to Supporting. Seiyuu role inputs are ignored. Image and source URLs must be HTTPS.

## Expand the catalog

Use Tenrai discovery from the Catalog & prices tab. It imports MAL character portraits, Main/Supporting roles, bilingual anime titles and Japanese voice actors. The same section shows discovery/favorite scan progress, pause/resume, and a manual favorites refresh. See [CATALOG.md](CATALOG.md).

GET /api/catalog?kind=character&q=Frieren&page=1 returns a public 40-card page. Add `rarity=SSS` and/or `role=main`; accepted roles are main, supporting, unknown, and role filtering is rejected for seiyuus. Rarity also accepts Pending. Search checks both title languages. Host role corrections override source classification without creating a second identity. JSON imports accept series_romaji and series_english. Actors remain unclassified. Gender filtering is not implemented.

All reset scopes protect the character/seiyuu catalogues, bilingual titles, import checkpoints and rarity data. Full registry deletion still revokes every account/session and resets gameplay/prices. Automatic sync recreates source player IDs as unregistered identities afterward; deleted passwords, administrator roles, and collections do not return. The one-time ACDB retirement migration is separate and never clears the Tenrai catalogue.

## Trading, showcases, and games

Every identity receives a one-time 5,000-credit starting grant, including existing users. A persisted marker prevents repeated grants on sync, redeployment, or an individual/gameplay reset. Full registry deletion creates new identities when the sheet resynchronizes. Starting credits count as earned. Daily credits require an authenticated, idempotent `POST /api/daily` claim to receive 300 credits; login and state reads do not award them. The separate free five-card pack is claimed with `POST /api/daily-pack` and `{kind:"character"}` or `{kind:"seiyuu"}`. All five draws are uniform within the selected type, with no Main or rarity weighting. The one daily-pack marker covers both types, preventing a second claim by changing the selection. An empty selected pool or invalid kind does not consume the claim. Credits and packs have separate KST-day markers and disappear from the UI independently after claiming. Existing claim markers remain valid on deployment.

User auction durations accept whole hours from 1 through 168. Optional buyout prices must be at least the minimum opening bid. A direct buyout or bid reaching that price completes at the buyout price, refunds any other bidder, pays the seller once, and immediately transfers the card with its enhancement level. An existing leading bidder pays only the difference. The UI offers page-number input and nearby-page selection for large catalogues; exact totals are shown only when available.

My collection shows anime progress for each owned character's primary anime. Cards in open sale escrow count as owned, duplicates count once, and seiyuus are excluded. Bilingual titles follow the viewer's language preference. A local catalogue index backfills one bounded character bucket per alarm and updates incrementally on imports; no extra upstream requests are made. Progress denominators grow with the imported catalogue. This reflects primary anime associations, not every anime appearance of each character.

Players may pin up to 20 owned cards from My collection. Completion counts unique owned card identities, including cards in open listing escrow; duplicates do not add progress. Selling an extra copy transfers level 1. Selling the enhanced base card transfers its level and leaves any remaining duplicate copies at level 1. Acquiring an already-owned card keeps the higher level and adds one copy. Listed cards are held by the server until sale or withdrawal.

The weekly shop selects ten distinct cards from the combined character/seiyuu pool on Monday at 00:00 UTC, refilling each purchased slot immediately. Each card has one shared copy. Prices are fixed when selected: D 50, C 100, B 200, A 400, S 800, SS 1,600, SSS 3,200, Ubers 6,400, AG 12,800; Pending 50. Shop has permanent Buy cards, Sell cards, Player marketplace and Your listings sections. Players can sell instantly at half the rarity price times invested copies, or set a marketplace price of 1–1,000,000 credits. Players can have 20 open listings across marketplace and auctions. Auctions run 1–168 hours, cannot be withdrawn after a bid, refund outbid users immediately, and pay sellers once at closing or buyout. Winners claim cards unless bought out; unsold cards return automatically. No listing or selling fee is charged.

Pachinko contains Mahjong, Gem faceting and Coin flip. Faceting has 10 Brilliance and 10 Fracture nodes: 75% start, success −10 points (minimum 25%), miss +10 points (maximum 75%). Each cut costs 50 credits; all 20 cuts must finish before a new gem. The final cut pays max(0, 45 × (Brilliance successes² − Fracture successes²)) automatically. Unfinished gems persist. Coin flip is fair heads/tails, accepts whole stakes 1–1,000,000 within the wallet, and pays floor(stake×1.75) including the stake on a win; losses pay 0. Retired dice games remain disabled. Best Gamblers/Biggest Losers use net payouts minus stakes, sorted descending/ascending; zero-stake uncut gems are excluded. Costs and winnings do not increase Cumulative earned credits.

Public pages: `/api/market?venue=shop|auction&kind=character|seiyuu&page=1`, `/api/rankings?metric=earned|balance|gambling_won|gambling_lost&page=1`, and `/api/pickems?page=1`. Player mutations use the existing same-origin authenticated, idempotent API. Pick’em statuses are Open (voting), Locked (deadline passed, awaiting results), and Settled (results applied).

## Administrator accounts

The protected `POST /api/host/admin-account` accepts `{player, password}` (optional `name`) and creates the administrator only for the unregistered canonical arpia97 ID 368. Other IDs are rejected. It does not overwrite existing passwords or grant privileges through ordinary registration. Administrator passwords support 8–256 characters; one-use recovery still requires 12. Passwords are salted and hashed. Sessions are HttpOnly and SameSite Strict. Locking an account-based console signs out that session. Gameplay resets retain administrator roles; deleting the entire registry also deletes administrator accounts, so retain the independent deployment token for recovery.

## Seiyuu import controls (Tenrai)

The `jikan-*` endpoint names are retained for compatibility. Requests now use Tenrai at `https://api.tenrai.org/v1`, which preserves Jikan v4 schemas and MAL IDs. Jikan’s public instance was discontinued on October 1, 2026 ([maintainer announcement](https://github.com/jikan-me/jikan-rest/issues/613)).

GET `jikan-status` returns source-import progress, including the active provider. POST `jikan-start` starts or resumes the finite anime-catalog scan; POST `jikan-pause` pauses it. Use empty JSON objects for these controls. The host Catalog & prices tab exposes these controls and refreshes progress every 30 seconds. Jobs run on Cloudflare alarms, so a local computer or open browser is unnecessary. Temporary errors retain the same page/title and increase the delay; HTTP 400/403 pauses for inspection. Existing MAL actor IDs are preserved, and existing actor metadata is not overwritten by the discovery pass.

The paid deployment sets `BACKGROUND_IMPORT_MODE="continuous"` in `wrangler.jsonc`. This removes the app's former daily SQL-budget pause without resetting its usage counters, saved anime page/queue, imported cards or favorites checkpoint. Discovery and favorites share one leased source request at a time with at least thirty seconds between requests; upstream backoff and Retry-After remain enforced, favorites refresh every 15 days, and the host can still pause manually. The scan keeps its current MAL-ID order. `resourceBudget.mode` in host state reports `continuous`; the daily row limits and `nextResumeAt` are `null`. If this setting is absent or unrecognized, the conservative free-plan defaults remain: background work pauses at 2 million observed reads or 30,000 writes until the next UTC day. The counters are app-local estimates, not a Cloudflare billing report. After enabling continuous mode on a paused schedule, use `jikan-start` once to reschedule the existing job immediately; do not reset/recreate it.

## Character migration and favorite refresh API

- GET /api/host/acdb-retirement: authenticated preview of affected ACDB inventory, avatars, auctions, overrides and manifest; save privately before replacement.
- POST /api/host/replace-acdb: body {"confirmation":"REPLACE ACDB WITH TENRAI"} plus an Idempotency-Key. Retires only ACDB and enables combined Tenrai discovery. Retries preserve progress.
- POST /api/host/favorites-refresh: body {"intervalDays":15}. Starts a batch scan, or updates an active scan's interval without losing its checkpoint. Does not bypass backoff. All upstream work uses the shared ten-second interval.
- GET /api/host/jikan-status: discovery plus nested favorites scan state. Legacy jikan-start/jikan-pause paths control the combined Tenrai job.

Catalogues and import metadata are preserved even with reset-all/deleteRegistry:true. No host reset endpoint clears them. AG is the abbreviated Anything Goes tier; rarity is derived from favorite counts, not submitted in host catalogue JSON.

Community cards are the exception to MAL rarity ranking. Host catalogue imports may include `fixedRarity` (D, C, B, A, S, SS, SSS, Ubers or AG) only on IDs beginning with `community-`. These cards keep their host-assigned rarity independently of MAL favorites and never enter the MAL percentile histogram. Omitting the field on a metadata edit preserves the existing fixed rarity; explicit `null` clears it. MAL IDs cannot receive a fixed rarity. Community cards join ordinary character/seiyuu pools, rarity search, shop/auction selection and collection progress normally. `public/community-cards.json` contains the 21 GGius Tours character definitions and public image URLs; original image bytes are stored in `public/community-cards/`.

## Refresh weekly selections

`POST /api/host/refresh-weekly` accepts `{ "confirmation": "REFRESH WEEKLY SELECTIONS" }` with normal administrator authorization and an Idempotency-Key. It closes active community auction lots and refunds held bids, expires the current weekly shop, then generates five community auctions of each type and ten mixed-pool shop cards. Timers keep the regular Monday boundary. Past unclaimed wins, already purchased cards, player auctions, marketplace listings, catalogue and importer progress remain intact. Retry with the same key to avoid repeating the refresh. This is separate from player/gameplay reset tools.

`POST /api/host/refresh-auctions` accepts `{ "confirmation": "REFRESH COMMUNITY AUCTIONS" }` with the same authorization and idempotency requirements. It refreshes only active community lots and refunds held bids; the weekly shop is preserved exactly. Neither refresh changes the catalogue/import checkpoints or player listings. Community odds are AG 3%, Ubers 7%, SSS 15%, SS 20%, S 20%, A 15%, B 10%, C 7%, D 3%, choosing a tier then a uniform eligible card. Missing/exhausted tiers renormalize; Pending is a bootstrap fallback only when no classified cards remain.

Normal packs are uniform; the legacy `mainWeight` settings parameter is ignored. Premium doubles AG/Ubers/SSS/SS/S probabilities, funded only by D. Weekly shop prices double from D 50 to AG 12,800; Pending is 50. Players choose their own marketplace prices.

Authenticated `POST /api/sell-instant` accepts `{card, variant:"extra"|"card", expectedRarity, expectedLevel, expectedPrice}`. Card Alchemy uses confirmed, versioned POST /api/alchemy-feed and /api/alchemy-draw, with separate POST /api/alchemy-target. All mutations require an Idempotency-Key and reject stale terms before changing inventory. See CATALOG.md.

Public `GET /api/featured` returns up to three distinct SSS/Ubers/AG cards. Authenticated state includes `auctionWins` for ended, unclaimed, unseen wins; `POST /api/auction-notice` with `{auction}` acknowledges only the current winner's ended lot. Acknowledging does not claim the card. Shop purchases and claims return card metadata plus the transferred level for reveal effects; repeated mutations replay their original receipt.

State and compact game snapshots also include up to 20 unseen private `notices` and their referenced cards. Marketplace sales, auction seller payments, outbid refunds and buyout wins are recorded atomically with the financial transaction under unique event keys. `POST /api/notice-seen` takes `{ids:[...]}` (1–20 IDs), requires the owning player session and an idempotency key, and acknowledges only that player's notices. Acknowledgment does not change credits or ownership. The browser acknowledges after showing a popup, so events survive offline visits; buyout reveals acknowledge their returned `noticeIds` to avoid a duplicate popup. Seen history retains the latest 100 per player; unseen events remain pending. Existing sales are not imported into this inbox, and ordinary auction wins continue using `auctionWins`.

Weekly shop purchases preserve the sold row for audit and create a new listing ID with a uniformly random card from the combined pool, excluding current listings and the just-purchased card when an alternative exists. The replacement uses the rarity price at creation and the same weekly deadline. The purchase and refill share one transaction and idempotency receipt. A stale sold ID cannot buy its replacement. Existing sold-out slots backfill automatically. Player marketplace purchases do not refill.

Starting-credit upgrade: existing identities with the old 1,000-credit grant receive an additional 4,000 once, including earned-credit totals. A persisted starter_amount of 5,000 prevents re-grants on login, sync, redeployment or gameplay reset. New identities receive 5,000. Both premium pack prices migrate once to 1,000; later host price edits are preserved.

## Pachinko API and clean beta launch

`GET /api/game-state` requires a player session and returns that player's wallet, Mahjong/faceting/horse-racing state, recent ledger and pending auction-win notifications/card metadata. Game mutations also include this compact snapshot. Clients apply it directly instead of fetching full shared state after each move. Horse-racing payouts settle once against the server clock on state/game-state refresh; see [racing rules and API](RACING.md). Gameplay uses a short per-player burst guard (30 immediate requests, 6 restored per second). Authentication throttles remain unchanged.

Authenticated, idempotent POST `gem-start` takes `{previousGame:null|id}`; POST `gem-facet` takes `{game,version,row:"good"|"bad"}`. State includes only the current owner’s gem. A stale game/revision or full row is rejected before charging; repeated keys replay the original result. Roulette replaces Coin Flip; the old `gamble` endpoint returns 410. New roulette/climbing endpoints, returns and balance calculations are documented in [PACHINKO-GAMES.md](PACHINKO-GAMES.md). Mahjong APIs/history remain supported. Game state follows alias migrations and is cleared by existing gameplay reset scopes.

The explicitly authorized October 25 clean-beta reset is complete. `beta-reset` requires `{confirmation:"START CLEAN BETA"}` and a stable idempotency key; it clears gameplay, revokes sessions, restores 5,000 balance/earned/starter markers, and regenerates shop/auctions without touching identities, passwords or catalogue/imports. Do not repeat it on continuation or deployment. Ordinary user activity after that reset must be preserved.

The shop-price reduction halves available unsold weekly stock once, recorded by `settings.shop_price_revision = 1`. Existing cards, slot IDs and deadlines remain. Sold/expired shop history, past payouts, balances and player-set marketplace/auction prices are unchanged. New weekly stock and refills use the reduced ladder. Instant and batch selling use half of the new shop price; enhanced cards still multiply by invested copies. Stale higher sale quotes reject before consuming cards.

## Card Trades

GET `/api/trades?view=browse|listings|offers&page=1` returns 12 listings per page. Own listings/offers require authentication; anonymous browsing includes no offer details. Signed-in callers only see their own offers except on their own listings.

POST actions use the existing authenticated, same-origin, idempotent mutation flow:

- `trade-list`: `{card, variant: "extra"|"card", expectedLevel}`.
- `trade-offer`: `{listing, cards: [{card, variant: "extra"|"card", expectedLevel}, ...]}` with 1–10 physical copies. Repeated cards may use available spare copies plus at most one base card. Legacy single-copy payloads remain accepted.
- `trade-accept`, `trade-decline`, `trade-withdraw`: `{offer}`.
- `trade-cancel`: `{listing}`.

The listing copy and every offered copy are escrowed atomically. Offer responses include a `cards` array with the level of every held copy; older one-card rows are read without rewriting their escrow. Only the lister can accept/decline; only an offer owner can withdraw. Cancellation returns all cards, acceptance returns losing offers, and account resets return unaffected players’ held cards. No credits are charged. Catalogue, accounts, passwords and import cursors are unaffected by this additive schema.

## Manual Credit Deductions

The Credit Rewards tab has searchable recipient selectors for manual rewards and deductions (current name, canonical ID, aliases and username history).

POST `/api/host/deduction-preview` with `{player, amount, note}` validates 1–1,000,000 whole credits and returns `{player, name, amount, note, expectedBalance, remaining}` without mutating credits. POST `/api/host/deduct` with that reviewed quote and an Idempotency-Key applies the deduction exactly once. A changed balance returns409 and requires another review. Both endpoints require the same host permissions as rewards. Negative balances are rejected; lifetime earnings, contributions, cards and catalogue are unchanged. The ledger records the debit and reason.

### Focused Fusion Restoration

Owner-only endpoints support a reviewed reversal of the latest simple fusion: GET `/api/host/fusion-revert-preview?player=ID&key=SOURCE_KEY`, POST `/api/host/fusion-revert` with `{player,sourceKey,confirmation:"REVERT FUSION"}`, and GET `/api/host/fusion-revert-receipt?key=SOURCE_KEY`. Use the original fusion key as the idempotency key. The result must still be one unchanged Lv. 1 copy, all distinct Lv. 1 materials must remain absent, and later gameplay requiring review blocks reversal. The operation restores materials and removes the result atomically, preserves credits and the original receipt, and stores its own receipt to prevent repeat restoration. Enhanced/merged outputs require a separate plan.

### Quiz Scores and Titles

Host Console → Quiz → Reset Scores & Completion Titles clears the selected quiz’s leaderboard, active runs, best scores and completion titles after confirmation. Credits stay unchanged. Previously paid best scores remain in quiz_reward_history, so a reset cannot pay the same point or milestone reward twice. Other quizzes and the Host title remain unchanged. Editing a quiz’s perfect-score title updates every current holder because profiles resolve title text from the quiz definition. Leaderboards use best score descending, first-achieved time ascending, and stable player ID only for exact timestamp ties.

New pick’ems default to 1,000 credits for the correct winner. Existing pick’ems retain their configured rewards; hosts can still choose another amount. Legacy exact-score rewards remain 500 credits each.

### Reopen Voting

Pick’ems → Manage Published Pick’ems → Manage Tour exposes **Reopen Voting** for closed, unsettled pick’ems. Duration defaults to five minutes and can be edited. Existing picks, teams and rewards remain; players may submit or revise picks until the new deadline. Settled results cannot be reopened. Host POST `pickem-reopen` takes `{pickem,expected:snapshot,minutes?:5}` with an Idempotency-Key. The deadline is calculated from server time; stale snapshots and already-open polls reject without changes. Replaying a successful request does not extend voting again.

### Quiz Selection and Song Review

Select an existing quiz from the Quiz dropdown or use New Quiz beside it. Selecting a song JSON automatically runs a read-only review through the same AMQ matching and MP3 resolution used by Save Quiz. Review song names, artists, anime and skipped-row reasons in the scrollable list before saving. No quiz pool is changed by the review. AMQ audio metadata is cached between review and save.

POST `/api/host/quiz-preview` accepts `{input: <AnisongDB or AMQ JSON>}` with host authorization and the same upload limit as quiz saving. It returns matched song metadata and rejected rows without creating a quiz, changing songs, awarding credits or resetting scores.

### Edit Quiz Songs

Choose a quiz to load its current song pool. Check songs to remove and click Save Quiz; uncheck before saving to undo a removal. When uploading JSON, choose Add Songs to Current Pool or Replace Pool (the default). Imports still show their matched-song review. Duplicate MP3s appear once. Edits are checked against the loaded pool version, so another host's changes require reloading. Published quizzes must retain at least 20 songs. Existing runs keep their original song snapshot, and personal bests, credit rewards and completion titles remain.

### Enhancement Revision 2

The original revision-2 conversion capped cards at Level 6 (MAX), with 2/3/4/5/6 additional copies per upgrade. The transactional migration preserves original invested copies, returns remainders to inventory, and attaches escrow remainders to the held card. Do not delete or rerun its receipt. Authenticated GET `/api/host/enhancement-migration` returns the latest migration receipt and an invalid-inventory-level count for read-only verification. Before/after rows are retained in `enhancement_migration_rows`. No credits or ownership are reset. Old enhancement clients must refresh before submitting the revised costs.

The owner can read `/api/host/enhancement-migration?audit=1` to inspect the saved before/after conversion rows and original enhancement receipts. Optional `player` and `card` parameters add that player’s bounded pre-migration gameplay receipts, ledger and relevant card escrow history. This is read-only; it never reruns conversion or changes player inventory.

Quiz Song Review checks imported MP3 links before saving. Broken links offer Use Another MP3, Retry Link and Skip Song; replacement links are checked before acceptance. The audio-check endpoint is host-only, accepts at most eight songs per call and runs two remote checks at a time. Working results are cached for 24 hours; failed checks may be retried after a minute. A changed or expired review must be checked again.

### Enhancement Revision 3

Current upgrade costs are 1/2/3/4/5 additional copies, with total investments of 1/2/4/7/11/16. The one-time atomic revision-3 migration keeps current levels, refunds the invested-copy difference as spares, and carries held-card refunds through transfers or withdrawals. Existing spares are never auto-consumed. Credits, ownership, protection and Alchemy XP are unchanged. Existing Alchemy quote versions are invalidated; old enhancement/Alchemy clients must refresh.

Never delete either migration receipt. Owner-only GET `/api/host/enhancement-migration?revision=3&audit=1` returns the new audit in `enhancement_revision_rows`; `revision=2` returns the immutable original audit. Omitting revision selects the latest.

### November 5 Alchemy and Answer Repairs

Owner-only GET `/api/host/alchemy-compensation` previews historical XP and returns the saved receipt after application. POST with `{confirmed:true}` applies the audited difference atomically once. Historical compensation is 50% of actual old-rate XP in the current reset lifecycle, including batches and bonuses, regardless of XP already spent. Never clear `alchemy_compensations` to repeat it.

Owner-only GET `/api/host/quiz-answer-repair` previews verified working-answer additions. POST `{confirmed:true,signature:<preview.signature>}` applies that exact current plan, updates answer banks and unfinished question snapshots, and stores a receipt in `quiz_answer_repairs`. Scores, credits and completion titles stay untouched. Never delete that receipt. Future AMQ exports preserve `altAnimeNames` and `altAnimeNamesAnswers`; those cross-anime fields are absent from the public master list.

Quiz category is selected beside its name. Existing quizzes remain in Singers; Composers uses the same editor and scoring. Quiz count is no longer capped at 30. Team-result pick’em inputs have no separate text-field cap (the normal request size limit still applies); canonical AMQ aliases are shown with vertical-bar separators.
