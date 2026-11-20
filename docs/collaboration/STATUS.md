# Shared Status and Handoff

## NGMC team counter selection

Source `346e2ef` deployed as Worker `ab068aa6-6d1b-4697-9815-a53ce023ed73`. New NGMC matches close volunteer signup at 20 seconds and assign automatic counting to unfilled teams at 40 seconds from setup. Teams can opt in earlier and keep the assignment across songs. The suite passed all 564 tests, including mixed manual and automatic teams across rounds. The live NGMC page and its three updated UI modules returned HTTP 200.

## Shared backend stability

Source `998426a` is live at 100% on Worker `f7c0b16f-ef1b-4910-bdc6-a2e0fd0195be`. Guest Play state and public presence bypass account storage. Public lobby, queue and presence reads can serve a snapshot up to 60 seconds old during storage interruptions. Sign-in has less database work, and receipt-protected quiz moves can recover once from a lost reply. All 564 tests passed, including a lost response after an answer was saved, snapshot expiry and overload handling. Live guest checks returned HTTP 200 for health, Gacha state, Play state, lobby directory, queue counts and presence.

## Interrupted multiplayer audio

Source `fa53170` is live at 100% on Worker `cb225a64-93d8-4af4-b19c-53009783be0a`. During guessing, Play detects interrupted playback, retries at the room position and offers Resume Audio for gesture-required playback. Hosts can see bounded, browser-reported audio issues by round. All 563 tests passed. Chrome browser fixtures at 1440px and 390px reproduced the earlier stuck pause, then verified recovery and preserved typed answers with the deployed assets. Firefox 160.0.1 decoded an encrypted fixture using the deployed modules, reported a real autoplay block, started the clip after a user gesture and recovered from an induced pause.

## Match abort and skip votes

Source `22cbf55` is deployed at 100% on Worker `5957c543-cafd-4f69-aec2-1a8bafd72c85`. A strict majority of the starting roster can abort any multiplayer match. All multiplayer formats now support a per-song skip vote. All 562 tests passed, including voiding a ranked room after a scored song and checking its rating and credit receipts. Desktop and mobile browser checks exercised the deployed controls with fixture match sockets.

## Multiplayer match chat

Source `4954a7d` is live at 100% on Worker `6f7362df-159f-4db9-94a0-64aa67a5169c`. Multiplayer rooms have movable chat with three editable emoji shortcuts, initially 🔥, 🌋 and ❓. The same room socket carries text and emoji messages. All 562 tests passed, including authenticated delivery to two players using a local match. Browser checks exercised the deployed chat modules with fixture sockets at 1440px and 390px, including particles, customization, dragging and minimizing.

## Play gameplay sizing and matchmaking credit payouts

Source `81409fa` is live at 100% on Worker `9ee42ffd-e473-4c30-a085-e443fd46c9f2`. The Play profile-picture menu has a direct host-only console shortcut. Gameplay controls and rosters are slightly larger. Matchmaking wins pay the base reward, losses half, draws the base, and cooperative 1-Team completions pay 200. Existing wallet receipts retain their original payouts on retries. All 562 tests passed, including wallet settlement through a local match. Desktop and mobile browser checks verified the control sizes. Live checks verified the new shortcut and stylesheet and confirmed that guest access to match review is denied.

## Balanced ranked NGMC 4v4

Source `42a6fcd` is live at 100% on Worker `184b0ff9-5f25-4d5d-86da-116a0c355e6e`. Ranked 4v4 now uses match-start Balanced Rating with a 48-point limit. The owner-authorized production replay on November 20 covered all 25 settled matches from the first game, 43 players, and the starting ratings of two active games. All historical matches were Random. Watched has a separate ladder with the same formula. An independent replay agreed with all historical receipts and all 43 leaderboard entries. The median absolute change per match was 5.09 points and the largest was 22.35. All 562 tests, syntax checks, and the Worker dry run passed.

## Play presence, input focus and ranked settlement

Source commits `8359cb5` and `0295bee` are live at 100% on Worker `43b605ac-a9a9-49b0-aa56-27429cd272ef`. The Play activity bar lists ongoing matches and signed-in online and searching totals. Answer fields retain focus through submission. Desktop and mobile browser checks verified the deployed assets, the public activity API returned live counts, and all 561 tests, syntax checks and the Worker dry run passed.

The November 20 NGMC repair was applied once after an independent numerical replay. Delayed receipts had caused stale starting ratings. Eight finished results and 20 player balances were corrected, with corrected starts saved for two ongoing matches. Post-repair checks covered all 19 then-settled rated matches. Every starting rating agreed with its history, the independent formula agreed to within 0.001 Rating, and all expected credit payouts were present. Original and corrected receipts are retained in the owner-only audit record.

## Card sale notifications

Source `ddfccff` is deployed at 100% on Worker `bf8071e7-0611-46df-a3e1-b6a756ff7ddf`. Marketplace sales, auction wins, and auction buyouts name the purchaser in seller notifications. Older entries resolve the buyer from a matching retained listing and player record. All 560 tests, syntax checks, and the Worker dry run passed. Desktop and mobile checks verified the deployed notification renderer with fixture sales.

## Play match recovery

Source `a95df9b` is deployed at 100% on Worker `32d5a3ee-7d99-46b4-968d-f60561e12294`. Large rating gaps could throw during NGMC settlement. Completed rooms now release queue reservations before calculating ratings and independently retry missing rating or credit receipts. Match preparation times out after three minutes. Across multiplayer modes, clients reconnect silent sockets and resynchronize overdue phases. All 560 tests, syntax checks, and the Worker dry run passed. The local multiplayer test recovered a lost final reveal alarm and a lost wallet reply, with exact payout and queue release. Desktop and mobile checks on deployed assets with simulated match sockets verified reconnection, result updates, and returning to matchmaking. The particular reported match and its wallet receipts were not identified.

## Smaller Play updates during matches

Source `0ed7c8b` is deployed at 100% on Worker `128aa4b0-c30a-49fe-b78d-1e10734ee3e8`. Match sockets negotiate incremental round history after receiving a full snapshot. Clients keep earlier reveals, accept counting corrections, and receive full reconnect and results snapshots. Scoreboards, download indicators, and open song lists reuse unchanged markup. Watched pool lookups reuse catalog-version-specific indexes. A local six-player Song/Artist fixture after 15 rounds reduced a routine serialized update from 22,247 to 3,038 bytes before compression. All 560 tests passed. Checks on the deployed desktop and mobile layouts with fixture sockets verified audio readiness, answer submission, history merging, updated scores and stable scoreboard and song-list elements.

## Play loading percentages

Source `a77ef39` is live on Worker `62d63acd-fe2d-49d9-8d93-b497aa85c848` at 100%. Queue sockets report catalog-read and song-check progress to match members. Play shows measured percentages in the queue badge, downloadable answer lists with a known transfer size, fixed-size queues, and lobby and audio readiness. The 560 tests, syntax checks and Worker dry run passed. A local two-player match with a deliberately delayed audio probe showed 95% on desktop and mobile before both players advanced. Both viewport sizes displayed catalog, verification, and finalization updates on deployed assets using fixture WebSocket messages.

## Faster multiplayer song selection

Source `ef5ce97` is live on Worker `b70be992-b626-4f7c-a5eb-ef7f3e234ce5` at 100%. Play reads catalog shards four at a time, verifies six candidate MP3s concurrently in draw order, and indexes occurrences for NGMC draws. Successful selections taking at least two seconds log catalog, draw and verification, and remaining metadata and decoy timings. The 560 tests, syntax checks, and dry run passed. Live read-only checks returned HTTP 200 for NGMC and the Play catalog (34,317 playable recordings). Local 35-song median timings with simulated mirror latency went from 792 to 353 ms for Random and 789 to 418 ms for Watched. Production match durations were not measured.

## Per-song playback readiness and Watched list filters

Source `fcac36f` is live on Worker `0362ef0d-616f-4114-a3b9-50e7bd89573d`. New multiplayer rooms wait for each browser to prepare the current clip before scheduling a shared start. Play names loading players and uses input-level focus styling. MAL and AniList imports accept any nonempty selection of Watching, Completed, On-hold, and Dropped. All 559 tests passed. Desktop and mobile Chrome checks on deployed assets verified encrypted MP3 decoding, readiness, answer submission, waiting-player names, and list status selection with fixture accounts and sockets.

## Smaller multiplayer opening download

Source `6673c03` is live on Worker `c9f2adac-8378-4619-ac96-d6428fd7453e`. New sealed matches buffer three songs and up to three decoys before starting. The client prioritizes the current group, downloads ahead with two independent requests, and resumes from the current group on reconnect. Fresh acknowledgments for required clips extend the audio wait within a bounded grace period. The shared guess clock starts after everyone is ready. All 557 tests, syntax checks, and the Worker dry run passed. Desktop and mobile Chrome checks exercised the deployed client with a delayed fixture clip.

## Play match-level inactivity rule

Source `9d36e82` is live on Worker `c8be795a-ec6c-414a-8c8a-194548c3d776`. Three consecutive completed matchmaking matches with no attempts trigger a 24-hour lock across queues. Incorrect guesses, Arena titles, and Arena votes break the streak. Cancelled matches, early forfeits, and custom lobbies are outside the streak. The former song-level bans are ignored. Credits depend on completion and connection at the finish. Missed songs and inactivity strikes do not affect the payout. All 556 tests, syntax checks, and the Worker dry run passed. An isolated Worker verified payout, streak reset, and cross-pool enforcement. The deployed notice was verified in Chrome at 390 and 1440 pixels using fixture socket events.

## Play completion credits and inactivity bans

Source `fb0bd09` is live on Worker `41516e5f-38a6-4220-9b3b-e0aa6ef48625`. Matchmaking credits require a normal finish and exclude leavers, players still disconnected at the finish, and players who end on at least three unanswered songs. Early forfeits issue no completion credits. Three consecutive unanswered songs in one match block all matchmaking queues for 24 hours. Incorrect guesses and Arena ballot votes break the streak. Affected players can finish the current game, and the existing ranked leave penalties still apply. All 556 tests, syntax checks, and the Worker dry run passed. An isolated Worker verified enforcement across modes and pools. The deployed ban notice was checked in Chrome at 390 and 1440 pixels using fixture match states.

## Play locked guesses and updated rewards

Source `64c98a3` is deployed on Worker `1426bed2-6eca-4099-9771-906830190442`. Play preserves the submitted wording in the private lock confirmation, team answers, reveals, and round history. The correct answer follows the display language setting. Arena pays 100 credits per completed round at match settlement, NGMC 3v3 Unranked pays 200, and NGMC 4v4 Ranked pays 400. The original 10% win bonus applies to the full payout. All 556 tests, syntax checks and the Worker dry run passed. Tests covered the new amounts and receipt replay. Verified the deployed lock confirmation and answer reveal at 390 and 1440 pixels using fixture match states.

## Play matchmaking credit rewards

Source `7b32cbd` is deployed on Worker `0aa460cd-0840-48bf-8805-62208dd5482f`. All seven supported matchmaking formats award completion credits to players who stay through a finished match. Winners receive a 10% bonus, including official forfeit wins and joint Arena winners. Cooperative 1-Team has no win bonus. Custom lobbies, cancelled matches, and departed players receive no payout. A match receipt protects wallet, lifetime earned credits, and notices from duplication. All 555 tests, syntax checks, and the Worker dry run passed. Isolated Workers verified actual wallet credits and retry safety. Browser checks used the deployed Play frontend with fixture results at 390 and 1440 pixels.

## Editable 1v1 lobbies and shared Quiz layout

Source `1642f25` is deployed on Worker `0fa01449-3ccd-4c96-9ad4-d8d6679d9026`. Hosts can set song count and guess time when creating an unranked 1v1 lobby and edit both in the room. Defaults are 20 songs and 20 seconds. An empty timer enables unlimited guessing. The Gacha and Play Quiz pages share the quiz list, lobby, gameplay, results, and mobile styles. All 554 tests, syntax checks, and the Worker dry run passed. An isolated Worker test verified edited settings reach the match and preserve ranked standings. Browser checks verified lobby editing locally and both deployed Quiz layouts at 320, 390 and 1440 pixels using the same fixture data.

## Unranked 1v1 lobbies and 20-song Arena fixtures

Source `b12dd2c` is deployed on Worker `ba778b92-b597-43e9-9ab1-23daacf13d81`. The 1v1 Ranked page has the shared Lobbies tile. Custom 1v1 uses two seats, 20 songs, 20-second guesses, and Random or Watched. Local Worker tests started both pools, tested finishing and leaving, and confirmed the ranked standings were unchanged. New Arena matches play 20 songs per opponent. The largest field uses 140 songs, verified in both pools with a catalogue fixture. All 554 tests, syntax checks, and the Worker dry run passed. Verified the deployed directory at 390 and 1440 pixels and the deployed Arena route and configuration.

## Play 2v2 Arena lobbies

Source `34b2842` is live on Worker `35f3e2f3-f68f-40ef-ac8b-5bf065f659ee`. The Arena matchmaking page now has the shared Lobbies directory with Create Lobby and Join by Code. Arena rooms support Random or Watched pools and optional passwords. The host can start with 4, 8, 12 or 16 players once all guests are ready. The existing round-robin rules set five songs per fixture and 20 seconds per guess. All 554 tests, syntax checks and the Worker dry run passed. Verified local browser creation, listing, joining, and leaving at 390 and 1440 pixels. An isolated Worker test started a four-player Arena match. Verified the deployed guest directory at both widths.

## Play profile badges

Source `08b8d10` is live on Worker `cb1f07bd-91c7-4ca0-9486-29a94162d7a3`. The Play profile pop-up shows Host as its only title. Verified the production frontend in Chrome at 390 and 1440 pixels using Host, Quiz Maker, and regular player fixtures with equipped quiz and card titles. Syntax checks and the Worker dry run passed.

## Quiz Maker badge sizing

Source `d722663` is live on Worker `63863d44-78b8-42c3-a173-a54bf595bdf2`. Live Chrome checks on Chata's profile at 390 and 1440 pixels confirmed both role badges use the same 21-pixel height, typography, and padding. Quiz Maker uses the SS palette. Twenty focused tests, syntax checks, and the Worker dry run passed.

## Gacha Quiz Maker access

Source `039fd1c` is live on Worker `4cadceae-3d91-44f5-9965-7fe5c54b1b49`. The production profiles for ArronChu (14) and Chata (51) both returned Quiz Maker with the administrator flag cleared. Full Hosts manage the SS role in Players & Access. A Quiz Maker opens directly to Content & Review → Quiz on desktop and mobile. All 554 tests, the syntax check, and the Worker build passed. Local browser checks covered the restricted console and the full Host permission form. Verified the deployed console and title assets.

## Shared Gacha card filter redesign

Source `a1f6b14` is live on Worker `186a3eaf-f42d-413b-a089-312049baa4a8`. Dropdowns stay beside search while the Filters drawer groups checkboxes. The shared toolbar aligns control heights, label spacing and selected styles across card browsers. Verified the live User Auctions controls in Chrome at 390 and 1440 pixels. Local browser checks also covered Marketplace, Catalogue, Collection, Wishlist and Favorites from 320 to 1440 pixels. All 43 focused tests, the syntax check and the Worker build passed.

## Gacha owned card favorites

Source `85ee0f8` is live on Worker `29922aa1-e394-43a4-930f-8badc6ff38d7`. Favorites is beside Collection in profiles and uses its filter layout and privacy settings. Inventory, listings, held offers, and unclaimed auction wins all count as owned. The cleanup archived and removed legacy favorites without an owned copy. Verified the production `favorite_ownership_v1` completion receipt. All 553 tests, the syntax check, and the Worker build passed. Browser checks covered own and public Favorites, filter controls, removing a favorite, and collection privacy at 320, 390, and 1440 pixels.

## Gacha market and auction filter layout

Released with `85ee0f8`. User Auctions and Player Marketplace share the Collection toolbar layout, with stacked labels, aligned search, sort and Filters controls, and matching checkbox styling. The syntax check and 16 focused market and auction tests passed. Browser demo checks covered control alignment, wrapping, and filter behavior from 320 to 1440 pixels.

## Gacha and Play notification dismissal

Source `2cc58d8` is live on Worker `e19e29f2-2acf-4d77-8005-e48ed18af12a`. Read notifications show an X to remove them. Once all are read, Delete All clears read notifications across all pages and preserves later arrivals. The inbox stores dismissals separately from the read receipt and retains event keys. All 553 tests, the syntax check, and the Worker build passed. Browser checks covered Gacha and Play desktop dropdowns and the mobile feed with isolated accounts. Verified live assets, both routes, and guest access rejection.

## Gacha Wishlist ownership filters

Released with `85ee0f8`. My Wishlist and public wishlists share the same compact filter layout. Owned Only sits beside Exclude Owned, and checking either clears the other. Both use the wishlist owner's ownership, including cards held in listings and offers and unclaimed auction wins. Visitor requests cannot filter a private collection. All 553 tests, the syntax check, and the Worker dry-run build passed. Browser checks used isolated Worker accounts at 320, 390, and 1440 pixels.

## Gacha Collection Strict filter placement

Released with `85ee0f8`. Strict exact title matching is immediately before Upgradable Only inside the Collection checkbox group, sharing its unchecked, checked, and focus styles. The group wraps on narrow screens. All 21 focused Collection, search, and wishlist tests passed, along with the syntax check. Browser demo checks covered desktop and mobile layout, filter toggles, and clearing both filters.

## Play player portrait glow

Source `53fb660` is live on Worker `bc01ce38-f1f3-4571-b8d0-585eb72e1361`. Custom lobbies, in-match player boards, and match results use the Gacha profile picture crop, rarity frame, and a static enhancement glow. All 553 tests, the syntax check, and the Worker build passed. Verified the lobby payload locally, browser-tested player portraits at 320, 390, and 1440 pixels, and matched all seven deployed assets against the local files.

## Gacha Favorites Only card filter

Source `59a37c1` is live on Worker `8e0b06a9-e0e4-4d9f-8f28-cb132507627b`. Signed-in collectors can filter supporting card views to their personal favorites. Catalogue, profile, market, trades, and target lookups filter before pagination. The filter composes with existing controls and removes an unfavorited card from the current results. All 553 tests, the syntax check, and the Worker build passed. Verified deployed UI with browser demo fixtures at 390 and 1440 pixels.

## Gacha card footer alignment

Source `89b2407` is live on Worker `929edaa2-ceb1-4432-a740-60e5097f41ba`. Showcase and auction card actions share a bottom row with the level badge. At very narrow widths, Showcase uses one column when needed to keep its buttons usable. Verified alignment at 320, 390, and 1440 pixels with deployed assets and demo data. The 12 focused tests and Worker build passed.

## Play Settings and AniList import diagnosis

Source `8ab0b41` is live on Worker `06494de2-7c22-4747-b3a6-3d198d28dfb7`. Settings is in the Play avatar menu. A public AniList list succeeded from a local connection but returned HTTP 403 with an explicit manual-block message from an isolated Cloudflare preview. Play now reports AniList's refusal separately from username and privacy errors and preserves saved lists. AniList API access from Play remains blocked upstream. Passed all 552 tests and the build. Verified the deployed Settings UI and import error display with local fixtures at 320, 390, and 1440 pixels.

## Play next-song timing

Source `92bf265` is live on Worker `d8177634-5ee3-4adb-99c9-5b8aaf6f026f`. Play multiplayer answer reveals last three seconds before the next song can start. All 552 tests and the Worker build passed, including timing assertions for the shared match flow and NGMC. Verified the live Play route and the deployed timing asset.

## Play account header spacing

Source `e296440` is live on Worker `39bd9db9-3247-4364-9231-94a89d532083`. Play and Gacha share the same header dimensions, spacing, and account control styles. On narrow screens, the Play queue indicator gets its own row. All 552 tests, the syntax check, and the Worker build passed. Verified live assets and measured matching spacing in both shells at nine widths between 320px and 1440px using browser fixtures.

## Owned Gacha card buttons

Source `ee4462a` is live on Worker `ca31051e-fd32-4538-9c09-f2ba95419d96`. Showcase is the labeled owned-card action. For Trade uses the scales icon between Protect and Favorite. Corrected demo routing for the trade marker. Passed 16 focused tests and verified desktop and mobile toggles in the browser at 1440px, 390px and 320px. Verified the deployed assets.

## Gacha quiz and account menu polish

Source `4ba4eb5` is live on Worker `766baf54-95a5-48f3-9a0c-1f58e95be6bf`. The quiz submit button is centered under the input. Settings opens from the avatar menu, and both Settings tabs hide scrollbars. All 27 quiz UI tests, the syntax check, and the Worker build passed. Verified the deployed layout and interactions against local fixture data at widths of 320, 390, and 1440 pixels.

## Gacha card actions, filters, and account header

Source `5234aa9` is live on Worker `33573864-6bef-4db2-8f6d-417a4da4688c`. Owned cards use back-only actions with the Showcase pushpin and account-backed Favorites. The approved account menu, unread count, Settings display preferences and shared filters shipped in the same release. All 552 tests passed, including independent private favorite state. Browser checks covered actions, persistence, filters, and the header at 320, 390, and 1440 pixels. Both GitHub workflows passed. Verified the canonical Gacha HTML and assets and the updated production account-state response.

## Gacha card filters and action previews

Implemented the shared filter toolbar locally for Collection, Catalogue, profile collections and wishlists, player marketplace, user auctions, trades, and Alchemy. Strict compares the complete card name or anime title before pagination. Filters expose removable chips and keep existing sort and ownership controls. Validated the desktop and mobile UI with local demo data. All 551 tests and the Worker dry-run build passed. The three Favorites and card action layouts are standalone previews under the adjacent card-design-review folder. Gacha deployment is pending.

## Play account header

Source `c412030` deployed to Worker `b1158f02-b0a3-42b7-bc64-cfe091d2c863`. Play now has the avatar menu, unread-count bell and shared display preferences in Settings. Verified authenticated menu interactions with local fixtures at 1440px and 390px, the Worker dry run, all 550 tests, and live Play markup and assets. The revised floating Gacha card is a local snapshot under `../card-design-review/floating-revised.png`.

## Play 1v1 Ranked navigation icon

Source `397b221` deployed to Worker `cc5aef74-e64a-4d12-98e7-2205fdc18f3e`. The left menu and mobile navigation use a head-to-head icon. Verified both responsive layouts locally and the updated asset at the live 1v1 Ranked route. The isolated Worker build passed.

## Gacha account menu preview

Pending in the local `feature/play-watched` checkout for review. The avatar opens Profile, Friends, Activity and Sign Out. Activity shows the account summary and recent ledger. Card Size and Anime Titles are in Settings, and the bell shows the unread count. Checked both 1440px and 390px layouts with local data, including keyboard dismissal, account actions, preference persistence and notification reads. All 550 tests, syntax checks and the Worker dry-run build passed. The Gacha changes were excluded from the Play icon release.

## Standalone 1v1 Ranked

Source `9166705` deployed to Worker `6a658f02-578a-4f7d-95d0-4378ff5d0c14`. The 1v1 Ranked tab sits above NGMC and runs head-to-head anime-title guessing. Matches have 20 songs, 20 seconds per song, and one point per correct anime. The higher score wins and equal scores draw. Random and Watched have separate queues, Elo ratings starting at 1,000, and win-loss-draw records. Match Elo uses K=32. The existing 25-point ranked leave penalty applies to the active 1v1 pool. Song/Artist 1v1 keeps its own records.

All 550 tests, syntax checks and the Worker build passed. Local WebSocket and browser checks covered both pools, answer privacy, scoring, forfeit settlement, Rankings and the mobile layout. Verified the new live route, asset contents and both ranking endpoints.

## Watched lobby eligibility

Source `bd0038c` deployed to Worker `15a8ac2e-34e3-4efa-a871-1769668e4fb0`. Watched custom lobbies show the combined distinct anime eligible in the catalogue and the number of songs required. Hosts see a warning and Start is disabled for a known shortage. The count updates with the roster and periodically refreshes imported lists. Audio availability is still checked when drawing the songs. The public Random badge now uses a blue background.

All 550 tests and the Worker build passed. The local Workers fixture verified duplicate anime are counted once and counts update when a player joins or leaves. Browser checks verified the shortage warning, Start becoming available after lowering the song count, the mobile layout, and the Random badge colour. Verified the live Play routes, public lobby endpoint and deployed assets.

## Watched pool for Play

Source `af4324a` deployed to Worker `fe14f916-3457-43d7-a4c6-3bc569194712`. NGMC, Arena and Song/Artist matchmaking remember the Random or Watched selection per mode in the browser. NGMC 4v4 matchmaking is ranked and 3v3 is unranked in both pools. NGMC and Song/Artist public lobbies display their song pool. Custom NGMC remains unranked. Competitive rating, records and leave penalties are scoped to the selected pool. Existing ranked results continue to appear under Random.

Watched uses each imported list's distinct shows and a per-anime contribution of one over the square root of list size, added across players. The A-Res order uses log-scores. Draws use distinct anime and recordings, with 35 songs for NGMC and the mode or lobby song count elsewhere. Missing lists contribute no titles. The match uses a saved list snapshot to select any audio replacements.

Passed 550 tests, syntax checks and the Worker build. Verified an eight-player Watched NGMC draw with 35 distinct anime and isolated ranking results in the local Worker fixture. Checked the saved switches and public lobby labels in a browser at desktop and mobile widths. Snapshots are in the adjacent `watched-play-preview` directory. Verified live Play routes, new assets, lobby and queue endpoints, and separate Random and Watched ranking responses via read-only checks.

## 2v2 Arena and Gacha notifications navigation

Source `54a38c4` deployed on Worker `19bb07a0-8081-49dc-bdb3-a52813bc7d63`. Arena balances pairs using NGMC Rating and runs a round robin with five songs per opponent and a 20-second guess timer. Each teammate can propose one title and vote. The most voted title is graded for the pair. Ties, including when neither teammate votes, are resolved randomly among the tied titles. On desktop, answering sits to the left of standings.

Gacha no longer lists Notifications in its sidebar or mobile More menu. The desktop bell opens the dropdown and its link reaches the inbox. The mobile bell opens the inbox directly.

All 549 tests, JavaScript syntax checks and the Worker build passed. The live Arena route, ballot and timer assets, queue-count endpoint, and guest inbox protection were verified. Browser checks at 1440px and 390px used the live Gacha frontend with isolated inbox data. Arena gameplay was verified locally through matchmaking and reveal.

## Multiplayer match review highlights

Source `61cbae5` deployed on Worker `4760370a-a94a-4d81-afa9-fb2c15144b17`. Completed matches are indexed automatically. Opening Highlights analyzes retained older logs. Both host consoles offer a flagged-match filter, per-player evidence and links to the original event timeline. All 546 tests, syntax checks and the Worker build passed. Verified the production host index and filter, guest rejection and the deployed review component with isolated evidence at 1440px and 390px.

## Gacha desktop notification dropdown

Source `344a372` deployed to Worker `a11aefb3-5b00-452a-b46c-96725aa61699`. The desktop bell dropdown and full inbox have individual checkmarks and bulk read controls. Verified deployed assets at 1440px and 390px using isolated notifications, including persistence, unread badges, older items and arrivals after opening. All 545 tests, syntax checks and the Worker dry run passed. Card designs remain local previews.

## Mobile rankings and quiz score sizing

Source `113b7ef` is live on Worker `4718e28c-bcdf-4689-b046-cc939ee0b9d9`. Tested the deployed Play ranking name column and sticky horizontal scrolling, plus perfect-score glyph bounds on both Gacha and Play. Browser checks used fixture records at 320px, 390px and 1440px.

## Quiz results on Gacha and Play

Source `d1bd605` is deployed on Worker `0237e7d3-6918-4dd1-918c-524217134aeb`. The completed quiz now shows the cover, rarity-coloured score, time, personal best, per-song progress, applicable rewards and replay controls. All 545 tests, syntax checks and the Worker dry run passed. Verified both live quiz routes at 1440px and 390px with isolated account and run data, including recap, replay and the scrollable Top 20.

## Play Watched lobbies and host console

Source `c21aa01` is deployed on Worker `c27daba4-132d-42af-a70a-7bc759dba51e`. Play Settings imports a public MAL or AniList account. Custom Song/Artist and NGMC lobbies can use the union of participants’ imported lists. The Play Host Console is in the signed-in host account menu and includes manual master-sheet refresh and match review status and notes. The Worker cron runs Sundays at 04:12 UTC. The staged sheet publisher was rehearsed in isolated workerd SQLite with the full Google export (29,392 rows, 27,080 recordings). All 545 tests passed. Confirmed the live schedule, guest access checks and deployed UI at 1440px and 390px using isolated account data.

## Gacha notifications

Source `f101aa9` deployed to the Gacha Worker as `d000ccba-2900-43b7-8307-778bdf46f9c9`. The inbox at `/gacha/notifications` includes group and unread filters, compact thumbnails and per-player read status. General and Notifications share the existing Settings form. New event types deliver prospectively. Personal and friend quiz overtakes are opt-in, with existing friend preferences retained. All 544 tests, syntax checks and the Worker build passed. Verified production routes, assets and guest authorization. Tested deployed desktop and mobile UI with isolated account data, including preference persistence and read actions.

## Gacha quiz lobby and gameplay

Source `872cf14` deployed on Worker `242625a8-13bd-46f2-9d1c-b136661251fc`. The Gacha lobby uses the quiz cover and personal-best colour, with Song List beside Start Quiz. Top 20 scrolls within ten visible rows. Gameplay colours the header by current score. Verified Song List column sorting, reveal Enter, progress squares and leaderboard scrolling against the deployed frontend at 1440px, 390px and 360px with isolated quiz data. All 63 focused quiz tests, syntax checks and the Worker build passed. The card search design remains a local preview.

## Play ranking mode tabs

Source `9858e60` is live on Worker `7cd3baf4-dc7e-4e1b-be25-7ce87705132f`. Verified all four header tabs, keyboard switching and the default Quiz points order in production Chrome at 1440px and 390px.

## Play artist autocomplete and Quiz rankings

Source `a82bdfd` is live at 100% on Worker `7b855a45-85cf-4ff2-912d-72bb7a638d0e`. The production artist catalogue contains all 18,095 AMQ+ credited performer names and aliases and all 33,748 names from the bundled AMQ artist directory, for 34,209 distinct suggestions. Compared with the preceding live list, 321 names were added. A live browser verified AKI (SweetS), AZKi, and Aika Kawashima (also found in reverse name order). The Quiz Rankings UI and default API order were verified highest cumulative personal-best points first. Local match dropdown selection, 543 tests, syntax checks and the Worker build passed.

## Gacha host console and Broadcast Play layouts

Source `c7fd61b` is live on the Gacha/Play Worker, version `858ebb5f-9612-4403-b479-3bf2dcbd606f` at 100%. The host console groups tools by task, preserves reward drafts when switching between tour batches, individual grants and deductions, and shows portraits repaired during the existing 15-day rarity scan. Custom Song/Artist and NGMC rooms and the Play rankings page use Broadcast layouts.

All 543 tests passed. Local Chrome checks covered 1440px and 390px layouts, a 24-player reward review, catalogue and player controls, ranking sorts and mode selection, lobby creation, settings and leaving. Verified the public host, rankings and both multiplayer routes, the rankings API and all eight changed JavaScript/CSS assets. Local screenshots are in `outputs/host-play-ui-nov19` in the workspace.

## Gacha card portrait recovery

Source `0be35e7` is deployed at 100% on Worker `406845dc-ed9b-4bfa-bf0a-dab6f4bebfc5`. A check of 480 live MAL card portraits found one confirmed 404, Akiba, Megumi. The repair updates the old URL in both catalogue representations. Future favourites refreshes check changed MAL URLs and preserve healthy alternate artwork. The browser also recovers failed portraits by card ID. Verified on the production Gacha page that two copies of the broken portrait made one lookup and both rendered at 450 × 700. All 543 tests passed.

The live catalogue now returns `/images/characters/10/649291.jpg` for `mal-character-2973`. The file returned HTTP 200 and decoded at 450 × 700.

## Song/Artist grading and answer reveal

Artist overlap grading is live in source `e882172`, Worker version `b13f90d9-7d3b-40c5-ac76-d280effa352a` at 100%. Verified TrySail and Amamiya Sora against the shipped catalogue. The full 542-test suite passed before deployment.

The approved answer reveal is live at 100% in source `95c71e5`, Worker version `7f87c020-cfc6-401a-8f4c-1b752c65db7d`. The answer key appears once above the guesses with a single verdict at the right of each tile. All 12 focused tests, syntax checks and the Worker dry run passed. The public Song/Artist route responded and all five changed assets matched the release. Desktop and phone examples are in `outputs/song-answer-key-preview` in the workspace.

## Broadcast Song/Artist gameplay and Play results

Source `a54d57b` is deployed at 100% as `bd01602a-d849-498c-8e82-24cb841aff22`. Song/Artist uses a central round clock and answer console with team or player score panels. NGMC and Song/Artist results lead with the outcome and scores, then the leaderboard and expandable round history.

All 542 tests, syntax checks and the Worker dry run passed. Local browser matches covered 1v1, 3v3, 1-Team, custom co-op, free-for-all and NGMC Ranked on desktop and phone viewports. Both public routes and six deployed assets passed read-only verification.

## NGMC Broadcast gameplay

The owner selected option 2. Source `357202a` is live at 100% on Worker version `5d8f2bff-08f8-411d-b71f-e8c4ba7b0565`. NGMC centers the answer field and round clock between compact mirrored team rosters. On phones, both rosters sit below the controls. The center panel displays recording details once the round is graded.

All 542 tests passed. A local eight-player browser match verified readiness, both counters, desktop and phone layouts, answer submission, counting and reveal. Both public matchmaking routes and the three deployed gameplay assets were verified read-only.

## Play matchmaking redesign

Source `0c793eb` is live at 100% as `5d3b23f6-fff7-48fe-8fb0-bdb28cda274f`. NGMC Ranked and Song/Artist now use the Scoreboard banner above side-by-side Find Match and Lobbies panels. The panels stack on mobile. Song/Artist uses a single music note.

All 542 tests, syntax checks and the Worker dry run passed. Browser checks covered both public routes at desktop and mobile widths and local signed-in format, server and lobby controls. Three NGMC gameplay designs are awaiting selection.

## Play rankings and lobby actions — deployed

Source `3bc8c3b` is live at 100% as `a668197e-2e31-41af-b055-09e742694951`. Column headers sort all ranked players before paging. Quiz averages each player's timed personal bests across published quizzes. Song/Artist 1-Team is unranked and its ready timeout cancels the match without a Rating deduction or leave strike.

All 542 tests, syntax checks and the Worker dry run passed. Live Chrome checks verified both sort directions for Quiz average time, removal of the 1-Team selector, and top-right lobby actions in both modes at desktop and phone widths. Three matchmaking redesigns are local previews awaiting the owner's selection.

## Integrated Play catalogue — deployed

Source `62790b2` deployed at 100% as `faad315b-e691-4b04-91ca-2ed0597b28d0`. The live Play catalogue reported 34,306 recordings eligible for audio verification, including 667 additional recordings from the sheet and 27 from published quizzes. The production catalogue used sheet version `master-e8df07b47bcb18c4` and quiz revision `fbbcd1bade12b050`. Both the direct Worker and amqtours.app returned the integrated catalogue after the Durable Objects completed their rollout.

All 541 tests, syntax checks, and the deployment dry run passed. Three newly included sheet recordings passed real MP3 probes. No saved quiz pools, attempts, or scores were rewritten. Refresh the sheet with `python tools/build-master-song-answers.py`. Play detects published quiz revisions on use, at most once per minute. The public autocomplete catalogue can remain edge-cached for ten minutes.

## Play release — deployed

Source `0d584ff` is live at 100% on `amqtours-gatcha` as `13f929cf-3aa6-4584-917c-acd338b46ec9`. The Play routes, public lobby directory, all five changed client assets and the catalogue version were verified on amqtours.app. The answer mapping is available to the Worker through the asset binding and returns 404 over the public route.

Multiplayer and new Quiz imports now match against 29,392 AMQ master-sheet exports. All source rows resolved, and the richest accepted-title list was verified across 1,946 duplicate groups. Published quizzes and scores were preserved. To refresh the bundled snapshot, run `python tools/build-master-song-answers.py`, verify, and deploy.

## Play lobby directory and passwords — deployed

Song/Artist and NGMC have separate live lobby lists, public and password-protected creation, joining by code, and host password changes. Existing lobbies default to public. Custom NGMC uses the existing Rating and guess-rate inputs for balanced 3v3 or 4v4, with no ranked results. Local browser matches verified both sizes, a completed 4v4, return to lobby, guest browsing, password enforcement and responsive layout. All 540 tests, syntax checks and the Worker dry-run build passed.

Play hides native spinner arrows on all number inputs. Verified keyboard increments and minimum validation in Chrome for song count and guess time.

## Solo Song/Artist 1-Team keyboard navigation — deployed

In a custom 1-Team lobby with one active player, forward Tab wraps from Artist to Anime. Shift+Tab at Anime leaves the fields. Verified the full cycle with autocomplete open at desktop and phone widths, plus FFA and matchmade 1-Team keyboard navigation. Syntax checks passed.

Song/Artist keyboard navigation now lets Tab leave the last answer and Shift+Tab leave the first. Starting audio respects that focus choice. Verified with autocomplete open in local Chrome matches for custom FFA and matchmade 1-Team.

## Play match flow and autocomplete — deployed

Play shows audio percentages and player readiness, distinguishes counter signup from audio preparation, and begins guessing immediately after reveal when audio is ready. Players can revise submissions directly. Custom lobbies start with 1–8 present players, with Start counting as the host’s ready action. English and Romaji autocomplete entries retain their matching text, with typo fallback. Local Chrome sessions verified two-player FFA, solo team start, audio autofocus, revised answers, reveal details and result navigation. Six local NGMC clients verified readiness, counter signup, counting controls and the reveal pop-up. Full suite passed (540), along with syntax checks and a Worker dry-run build.

Source `1eaa8c0` is deployed at 100% on production Worker `amqtours-gatcha` as `1201ac2c-e92c-4ef0-bb69-966ac3f2c979`. The live Song/Artist and NGMC routes returned 200, and all seven changed Play assets matched the release files byte for byte.

## Play audio and automatic replacement — deployed

Source `0f3c4b6` is live on `amqtours-gatcha` at 100% as `e3e9c3f6-c0c9-4842-8ee1-9c2ec4a2b472`. A 15,841,697-byte recording that previously returned HTTP 502 produced valid encrypted 20- and 30-second samples in production. Both updated client files matched the tested sources. Match selection checks MPEG frames and redraws failed candidates. Unavailable clip responses now support server-confirmed replacement of a single slot for all players. Local checks covered a three-player matchmade 1-Team case with two teammates already loaded, custom lobby scoring, and the multiplayer runtime. All 540 tests and the Worker dry-run passed.

Play release `8e5816b` deployed to the shared Gatcha Worker as `11e01878-a4df-4907-a562-a092436c1f08` at 100% traffic. All 539 tests passed. Verified all five changed assets on the public domain against the tested source and checked the Song/Artist, NGMC, Gacha and Tour routes.

## Song/Artist 1-Team gameplay

Custom 1-Team lobbies support majority skip, owner-only guess withdrawal and reversible votes. Match results now lead with the preferred anime title. Updated match spacing and controls, added automatic audio retries for missing downloads and server-side fallback across all three AMQ mirrors. Two local Chrome sessions verified vote cleanup, skip scoring, anime results, desktop/mobile layout and recovery from an injected HTTP 502. A separate media check recovered via the third mirror. All 539 tests, syntax checks and the Worker dry-run build passed.

## Play header avatar

Restored the shared Gacha portrait layout in the Play account button and reduced the level badge overlap. Local Chrome checks at 320, 390 and 1440 pixels verified that portrait artwork fills the 32-pixel circle, saved crops apply, initials render, and the account button opens.

## Play queue badge

Removed the divider beside the leave-queue button. Verified the computed border and button click at 390px and 1440px locally.

## Shared branding and persistent queue — deployed

Gatcha and Play source 4e9db05 deployed to amqtours-gatcha as f97e2e7c-f77e-4a23-b9fe-8f128cdcaaa8. The Tour Site deployed public version 92 (source a9906491639f87eeb4da8cb9997d9e249dcc8d34). Production browser checks on Gatcha, Play and Tour verified identical logo dimensions, corners, wordmark typography, colors and subtitle spacing at 1440, 390 and 320 pixels. Public Play queue assets matched the locally tested release. Both suites passed (539 + 113 tests), as did the 65-second queue persistence check and both builds.


## Persistent Play queue — locally verified

While waiting, the header shows the queued format, live player count, a shortcut to matchmaking and a leave control. The same queue connection and heartbeat survive internal navigation. Reloads in the same browser tab reconnect through the existing server lease. A match found while browsing opens its ready screen. Local desktop and mobile browser sessions covered Quiz, Rankings, cross-mode navigation, reload, cancellation and a successful match after 65 seconds on Rankings. All 539 tests, 300 syntax checks and the Worker dry run passed. Deployment pending.


## Queue counts, W-L-T and Song/Artist ready forfeits — live

Source 18adece deployed to amqtours-gatcha as Worker 18154243-1e5f-408b-9505-e8d7787e39e2. Play shows per-format waiting counts and competitive standings record finished outcomes. Earlier matches recover from receipts, retained final state or complete Song/Artist reviews when available. Song/Artist 1v1, 3v3 and 1-Team have independent 25-Rating ready timeout penalties, rolling strikes and 72-hour queue restrictions. Verified 539 tests, syntax, dry build, mobile queue indicators, and a real 90-second 1v1 timeout using local browser sessions. Public Play pages, changed assets, queue counts and the standings API were verified after deployment.


## Play lobby readiness and pending multiplayer release — live

Released source 47d31a5 to amqtours-gatcha, Worker version 28b62019-0b17-4f92-aed2-f207778d6043. This includes the previously local Play rankings, custom lobbies, NGMC 3v3, counter controls, individual lobby return and ranked leave policy. Custom lobbies default to 20 songs, allow host setting edits, and require every member to ready. Auto-ready persists per account in the browser across Play modes. Matchmaking reminds at 30 seconds and cancels at 90 seconds if anyone has not confirmed. The ranked leave penalty applies in NGMC Ranked. Audio buffering is separate from confirmation. All 538 tests, syntax checks and Worker dry run passed. Local browser sessions verified lobby settings and readiness and exercised the real 30/90-second timers with eight players. Production NGMC, Song/Artist and Rankings routes returned 200 and the changed UI modules matched source.


## NGMC Ranked departures and custom lobby results — verified locally

The counter controls are compact. At the end of a custom Song/Artist match, each player chooses Leave Lobby or Return to Lobby. Only returning players enter the next roster. Leaving an active ranked match costs 25 Rating once, with a two-minute reconnect window for disconnects. A third active leave within 14 days blocks ranked matchmaking for 72 hours. Eight browser sessions verified the warning, cancellation, three exits from 1,000 to 925 Rating, the ban and subsequent unranked matchmaking. Custom lobby browser checks, all 537 tests, syntax checks and the Worker dry run passed. Pending deployment.


## NGMC 3v3 and Song/Artist custom lobbies — verified locally

NGMC 3v3 draws from ranked ratings and guess allowances, balances six players, and skips rating settlement. Song/Artist custom code lobbies support 1–8 players, host succession, 1–100 songs, finite or unlimited guess time, cooperative proposal voting or FFA, and a majority vote to return. Browser matches exercised counter signup, voting, attribution, both lobby formats, return and unranked NGMC completion. Additional checks covered capacity, final departure, host-only controls and eight-player FFA scoring. All 535 tests passed, plus syntax, diff and Worker dry-run checks. The working tree and screenshots in ../custom-play-preview are local.


## Play rankings and match results — local verification

The local working tree adds per-format Song/Artist ratings, existing NGMC totals, published Quiz personal-best rankings, match MVPs and selectable team answer tiles. Song/Artist rating histories begin with newly settled matches. MVP performance is the rating delta per scored song with points as a tiebreaker. All 534 tests, 294 syntax checks and the Worker dry-run passed. Browser fixtures completed all four multiplayer formats, verified the final leaderboard and rankings and checked mobile rankings width. Screenshots are in the surrounding outputs/play-rating-preview directory. Uncommitted, verified locally.


## Completed — Encrypted Multiplayer Audio

New Song/Artist and NGMC rooms use protocol 4. Real clips and up to three decoys preload from Play through sealed equal-length tickets and fixed-size AES-GCM packets. The Worker clips a server-selected random segment from an approved AMQ mirror, and the encrypted edge cache contains no clear audio. The Ready control unlocks the audio element with silence. The public room state omits clip identity and sample position through the countdown. Batch readiness prevents a per-track download probe, and each active player gets the current key at the server start. Reconnects receive the same current key and deadline. Future and decoy keys stay private. Final recaps contain names without source URLs. Existing rooms keep their prior playback format.

Runtime fe5e7cb is live on original Worker version 86081261-6943-4bc4-8b52-14a9389c0469. All 534 tests, 293 syntax checks, dry-run and diff checks passed. CI Verify 44260549745 and demo 44260549771 passed. Workers runtime exercised all four formats, early/future key rejection, equal ciphertext lengths, wrong-key rejection, reconnect, scoring and private review. Desktop and 390px Chromium fixture played decoded clips after round start within 25–32ms locally and kept deadlines through reconnect. FFmpeg decoded 20 clips from 10 public AMQ MP3 samples. Live verified both mode packet sizes, a valid decrypt with an isolated probe ticket, invalid ticket rejection, all three asset bytes, mobile lobbies and health 200. No production test matches or account changes. Evidence is in the surrounding work directory under encrypted-play-*. Ownership released.

## Completed — Gacha and Play Startup

Pachinko rendering, actions, forms and history have a dedicated entry module. Gacha loads Quiz and Pachinko resources on route entry and requests featured cards only on Home. Play loads the controller for the selected route and guests can browse matchmaking without starting the search worker or a socket. Quiz title data is deferred until a run, song list or match needs it. Retired Play placeholder markup and styles were removed. The compact Gacha boot response omits the unused embedded leaderboard. The existing full state response remains available.

Local cold-start JavaScript, CSS and JSON bytes dropped 31% on Gacha Home and Packs, 49% on Gacha Quiz, 64% on Play Quiz and 65% in the guest Song/Artist lobby. Local syntax validation went from 11.17s to 0.58s using Node's module parser in one process. The live compact guest API was 83,356 bytes versus 169,147 bytes for the full response.

Runtime 08f95f2 is live on the original Worker version 0eef82cf-1e11-4066-b819-38167211e988. All 534 tests, 289 syntax checks, dry-run build and diff check passed. CI Verify 44251701812 and demo 44251701832 passed. Desktop and 390px runtime QA covered Mahjong and Blackjack, normal and Competitive Quiz lock/continue/refresh, Play route switches, guest/signed-in matchmaking and rapid navigation during a module load. Five live guest routes loaded the intended assets, five assets matched byte-for-byte and health returned 200. No production test mutations. Evidence is in the surrounding work directory under modularization-*. Ownership released.

## Completed — Quiz Timing and Special Pack Update

The Quiz clock begins at the first authorized song start in normal and Competitive play. The two-second countdown stays visible. The saved result uses the final answer arrival. The owner-only repair corrected 5,847 distinct saved personal-best times across 179 quizzes using the original attempt evidence. Public leaderboard readback matched the corrected time and rank. A second scan found 6,712 verified timed records, two without sufficient start evidence, and zero remaining evidenced corrections. Points and quiz reward records were preserved.

Both paid Special Pack pools cost 3,000 credits for eight Premium draws and two independent guaranteed S-or-higher draws. Each guaranteed slot uses S/SS/SSS/Ubers/AG probabilities of 60/24/8/7/1. The five purchases of the original pack were refunded to four buyers for 15,000 credits total. The reversal accounted for all 50 pulls, including retracting one open Marketplace listing and recovering 300 recorded refinement XP. The owner preview reports zero remaining original-pack orders. Two purchases of the short-lived interim mix were identified for separate owner review.

Runtime e909b2a is live on the original Worker version f132dbde-bee0-4b14-997f-c3152ec683ab. All 534 tests, 287 syntax checks, dry-run and diff checks passed. Final runtime CI jobs 44246484846 and 44246484838 passed. All changed public assets match the deployment, Play resolves the shared Quiz module, and the repair endpoints reject unauthenticated requests. No production test purchases or attempts. Private evidence is in the surrounding work directory under quiz-countdown-*, paid-special-refund-*, special-pack-*, and pack-resale-live.json. Ownership released.

## Completed — Exact Fragment Suggestion Priority

Added contiguous query-text ranking between complete-word and prefix matching. Queries ge r / enge r prefer both Masamune-kun Revenge R titles above the shorter base titles; Shana S complete-word ranking, word-order names and shortest-first ties remain. Shared helper changes suggestions only, no grading/timing/data changes. Existing 33 Quiz UI/Play tests, 285 syntax checks, dry-run/diff checks pass. Local browser at 1280/390 in both Gacha/Play Quiz and actual multiplayer search worker confirms Revenge R first without errors/overflow. Source dbf2bb23b684d7d96beac6890645b87ff3d7c319 deployed to original Worker b963a157-4c15-4c3e-ae05-c5f360e7f9c8. Changed asset byte-matches live; same-origin browser Quiz/multiplayer imports return both Revenge R alternatives first. Verify 44241070381 and demo 44241070373 passed. Evidence work/answer-fragment-{tests,check,build,browser,deploy,ci}.log, browser-proof.json and live-proof.json. No production attempts or Host/proxy deployment. Ownership released.

## Completed — Paid Special Card Packs

Released Character and Seiyuu Special Card Packs at 3,000 credits for ten cards: nine unchanged premium draws plus one tier-weighted guaranteed S+ (S/SS/SSS/Ubers/AG 60/24/8/7/1%), uniform card within the selected tier/type. New paid purchase uses special:true, mutually exclusive with premium:true; ledger/receipt metadata distinguishes it from the legacy bonus gift. Empty guarantee tiers reject/roll back rather than weakening odds. Existing wallet/receipt/auto-sell/overflow and multi-pack behavior preserved. UI name Special Card Pack, type eyebrow, and only description “Guarantees one S and over.” Repeat purchase preserves Special selection/count/price. Demo parity and catalogue documentation updated. Settings advertise readiness before UI enables the product; default 3000 rows are additive/idempotent, no player migrations.

Exact branch-enumeration odds proof, nine-premium identity, both-type/bulk purchases, forged price/type validation, insufficient funds, idempotency, missing-tier rollback, legacy-gift isolation and auto-sell coverage pass. Existing reveal test covers ten-card Special repeat purchase without the bonus AG claim. All 532 tests, 285 syntax checks, dry-run and diff checks pass. First full run caught CRLF-sensitive existing alchemy extraction; retained app.js LF and reran full suite successfully. Real local Engine/browser at 1280/390 buys three packs of both kinds, verifies 30 cards/three guarantees, 9000 debit, 27 auto-sales, result pagination and repeated Special purchases without errors/overflow. No production test purchases/accounts.

Source 52e1139 deployed to original Worker 5c5ed668-2bd6-4dc6-bec1-e3bfad248070. Verify 44238749126 and demo 44238749287 passed. Six live assets byte-match. After normal deferred Game rollout, live state exposes both 3000 prices and guest browser at 1280/390 confirms both ten-card panels and guarantee-only description, no errors/overflow. No Host/proxy deployment or bonus-gift replay. Evidence work/paid-special-{tests,full-tests,check,build,browser,deploy,ci}.log, {browser,live}-proof.json, live-browser-proof.json and pack screenshots. Ownership released.

## Completed — Restore Gold Artist Premium Titles

User clarified the earlier reversion meant restoring the gold colour. Artist/Singers perfect 20/20 saved times below 60,000ms again project premium:true and render the original gold palette (same values as existing Tour identity.css). Composer violet/Franchise green overrides remain. Existing titles/equipment/scores/times/wallets are unchanged; no migration. Existing 12 title tests, 285 syntax checks, dry-run/diff checks and local/live visual fixtures at 960/390 pass Artist gold rgb(255,241,200) with Composer/Franchise colours preserved. Source aae16d3ccc92c99b90eb9e0ad7acd4fa27ff08e0 deployed to original Worker cf527865-d946-45bd-a0a1-5600c409c493. Live JS/CSS byte-match, health 200; Verify 44224816015 and demo 44224815914 passed. Evidence work/artist-gold-{tests,check,build,browser,deploy,ci}.log, {browser,live}-proof.json and live-browser.json. No production data writes or Host/proxy deployment; shared identity response restores the premium flag there too. Ownership released.

## Completed — Answer Suggestion Relevance

Shared Quiz/multiplayer suggestion rank now prefers exact normalized names, then distinct complete query words, then word prefixes, then partial substrings. Shortest-first cached row order breaks ties within each tier. Shana S outranks shorter Shana titles for shana s / s shana; comma-free word-order names and partial matching remain available. Ranking scans before applying the result limit, so stronger matches after many shorter rows are retained. No grading/answer-key or backend changes.

Existing 33 Quiz UI/Play tests, 285 syntax checks, dry-run/diff checks pass. Real local Worker browser at 1280/390 in Gacha/Play Quiz verifies Shakugan no Shana S first; actual multiplayer search worker returns same. 13,816-title cached query benchmark median .597ms / p95 .963ms. Source 97d024b deployed to original Worker 6e6ba020-3121-4faa-aafb-30b2897a94a0. Three live assets byte-match, health 200, same-origin browser imports confirm correct first result for Quiz and multiplayer without errors. Verify 44219730594 and demo 44219730653 passed. Evidence work/answer-relevance-{tests,check,build,browser,deploy,ci}.log, {browser,perf,live}-proof.json and live-browser.json. No production attempts, Host/proxy deployment or data mutations. Ownership released.

## Completed — Competitive Help Popover

Moved the full preload/tab-lifetime description from below Start Quiz into the existing detail popover on Competitive text. Separate labelled checkbox and help button preserve checkbox selection while hover/focus/tap show help, Escape/outside click dismisses it. Shared Gacha/Play UI. Existing 27 quiz UI tests, dry-run/diff checks and real local Worker browser at 1280/390 for both surfaces pass hidden description, hover/focus/tap, dismissal, checkbox toggling and no errors/overflow. Runtime 788e86ba531dfd064560a9137bc951e0e9f1e127 deployed to original Worker bf09a54a-3470-48a9-9680-a32d048b5bb8. Live JS/CSS byte-match, health 200. Verify 44217503940 and demo 44217503994 passed. Evidence work/competitive-help-{browser,tests,build,deploy,ci}.log and {browser,live}-proof.json. UI only, no gameplay/data changes or Host/proxy deployment. Ownership released.

## Completed — Revert Artist Sub-Minute Title

Singers/Artist quiz titles now use the regular aqua style at every completion time. Read-time premium flag is restricted to Composer/Franchise; title UI also ignores stale premium flags for Artist badges/settings. Keeps title IDs, equipment, completion times, scores and wallets; no migration or production data mutation. Existing title test extended for a 59.999s Artist result and stale payload; all 12 focused tests, 284 syntax checks, dry-run/diff checks and local/live visual fixtures at 960/390 pass. The first live fixture replaced an active app body and hit a late callback; corrected fixture renders the live title asset in a standalone same-origin document, both sizes pass without errors. Runtime 03e136f deployed to original Worker 8a088ad6-e197-485f-864c-1b9a42aa09b5. Live title-ui.js byte-matches, health 200. Verify 44213596750 and demo 44213596831 passed. No Host/proxy deployment; shared identity responses also carry the corrected premium flag. Evidence work/artist-title-revert-{tests,check,build,deploy,ci}.log and {browser,live}-proof.json. Ownership released.

## Completed — Quiz Transition Performance

Recent Play commits did not change Quiz timing/answers; normal Quiz still used shared Game while Competitive alone used isolated sessions. Current UI now requests fastSession for normal starts/restarts too; same existing actor setup/auth/retry/reward path, Competitive remains the optional full-pool download. Older attempts retain transport. Next confirmation no longer disables Lock/Skip/suggestion keyboard handling: one queued answer pauses audio immediately and sends once after confirmation; retries cannot replace it. Cached WeakMap title indexes remove per-keystroke normalization/full sorting without changing shortest-title ordering. No score/credit migrations or future answer exposure.

Full 530 tests, 284 syntax checks, dry-run and diff checks pass. Extended existing UI/runtime cases prove normal session routing, all 20 questions with zero shared Game SQL/housekeeping, private keys, immutable queued submission, late-answer protection, retry/restart and one-time reward settlement. Real Worker/browser at 1280/390, 4x CPU slowdown, compares pinned df0f5ac UI with 400ms simulated shared queue plus 1200ms Next-response delay: normal Next usable 1876/1894ms before vs 58/72ms after; answer reveal 898/861ms vs 103/95ms. Competitive Next 81/85ms; Play Quiz 72/79ms. Simulated figures, not live latency claims. Normal/Competitive/Play all pass queued Enter submissions, reload resume, stop and no page errors/overflow. Autocomplete 13,816-title benchmark retained identical results: 15.65ms/query before, .423ms cached after. Evidence work/quiz-perf-{focused,tests,check,build,browser,play-browser,deploy,ci}.log and {browser,play-browser,autocomplete}-proof.json.

Runtime 5aa7c47 pushed/deployed to original Worker 1f628c4f-114a-475c-a0bb-cf7b9c60a0aa. Verify 44195148452 and demo 44195148781 passed. Both changed JS assets byte-match live; health 200, unauthenticated run/session 401; Gacha/Play Quiz lists render at 1280/390 without errors/overflow. No production attempts or proxy/Host deployment. Live proof work/quiz-perf-{live-proof,live-browser}.json. Ownership released.

## Completed — Play Footer Links

Removed bottom-right Tours/Gacha footer links and their unused container CSS. Footer branding and sidebar navigation preserved. Source f306981 deployed to original Worker ebc82d28-f696-432d-ada9-9472467548db. Dry-run/diff checks and live browser at 1440/390 pass: no footer links, retained sidebar links/branding, no errors or overflow. Verify 44131621517 and demo 44131621331 succeeded. Evidence work/play-footer-{build,deploy,ci,demo}.log and live-proof.json. No gameplay/data changes or proxy deployment. Ownership released.

## Completed — Disable Unreleased Play Navigation

Arena and Speed remain visible but dimmed, without href or navigation handlers and marked aria-disabled/tabindex -1 in desktop/mobile menus. Direct visits normalize to NGMC Ranked. Source 121cc15 deployed to original Worker c7fd87a6-e7bc-42ab-9826-953ca39309ed. Existing route test, syntax, dry-run and local/live browser checks at 1440/390 pass disabled mouse clicks, excluded keyboard focus, working Song/Artist navigation and direct-route fallback without errors/overflow. Initial live check reached old assets immediately after rollout; ordinary retry passed both sizes. Verify 44131095679 and demo 44131095665 succeeded. Evidence work/play-disabled-{browser-proof,live-browser}.json and {build,deploy,ci}.log. UI-only; no gameplay/data changes or proxy deployment. Ownership released.

## Completed — Song/Artist Input and Reveal Refinements

Added private coalesced server drafts for timeout scoring (including typed final artist and existing chips), punctuation/spacing-tolerant complete-answer matching, Tab/Shift+Tab category cycling and remembered 1-Team category. Added 2-of-3 cancellable skip votes, shared per-song random sample fractions with full guess-window bounds, and hover/focus/tap artist member credits. Team reveal recap now uses team answers/correctness while preserving individual contributions. Artist library regenerated from the same cached master version; 33,748 names and 34,900 song mappings unchanged, added composition metadata. New rooms require protocol 3 so old clients cannot silently play from zero; old room sample positions remain zero. No economy changes.

Full 530 tests, 284 syntax checks, dry-run and diff checks pass. Existing runtime suite covers all formats/private drafts/legacy-client rejection/timeout; targeted desktop/mobile browser passes typed and chip timeout answers, Tab/Shift+Tab, 1-Team preference, skip vote cancellation/majority, team-green recap, artist popovers and shared sample offsets (80-second local fixture). All-four-mode browser regression passes ready/unlock, artist list editing, opponent privacy, volume/results with no errors/overflow. Runtime b7e50bf06577aaa4f5b7ebd879d3bcc10335c303 pushed/deployed to original Worker 2fb7509b-223f-4525-a5d2-9cc85f3786a0. Verify 44130236388 and demo 44130236407 succeeded. Seven live assets byte-match; health 200, guest host review 401, live guest page at 1440/390 passes. No production matchmaking/account mutations or proxy/Host deployment. Evidence work/play-input-{focused,tests,check,build,browser,regression,deploy}.log, browser-proof.json, live-proof.json, live-browser.json and reveal screenshots. Ownership released.

## Completed — Indefinite Match Review Retention

Removed the lobby retention notice and host review expiry labels. Match logs and queue review index no longer expire or disappear from host searches; legacy expiry alarms preserve stored records. Existing schema retained without destructive migration, event caps/host authorization and one-day gameplay cleanup unchanged. Extended existing Play tests: all four formats preserve events and searchable 60-day-old reviews after both cleanup paths. Full 529 tests, 282 syntax checks, dry-run, desktop/mobile lobby/review checks and diff checks pass. Runtime 9d91acc752d3c4e5f353b8c655b6374d25b8a93d pushed/deployed to original Worker 30d0e284-d12f-4d4c-a6e7-01f5fd86b0a2. Verify 44125633375 and demo 44125633713 succeeded. Live assets byte-match, health 200, guest review 401; authenticated original Worker review list succeeds and existing match reports expires:null after deferred actor rollout. No production gameplay mutations or proxy deployment. Evidence work/play-retention-{focused,tests,check,build,browser,deploy}.log and {browser,live}-proof.json. Ownership released.

## Completed — Yuusha de Aru Working Titles

Applied the user-requested manual answer additions to seven songs in the existing 44-song Franchise quiz through authenticated host preview, audio validation and version-guarded append/save. Added Romaji/English Dai Mankai titles to the 7-star and 12-star songs, Inori no Uta acoustic guitar ver, Hanachiru Ame and Kazamuki; Hero Chapter titles to Jukai no Naka e and the Suzuko Mimori/Kana Hanazawa Yakusoku. Verified exactly 14 added answers, all original answers retained, song IDs/audio/name/artist unchanged, and all other 37 song objects unchanged. Additions are also stored in workingTitles. No code change/deployment, score reset or quiz attempt. Existing running snapshots retain their answers; new attempts use the updated pool. Local evidence work/yuusha-{answers-before.json,answers-after.json,answer-update-preview.json,answer-update-proof.json}; runtime remains 8c21f7c. Ownership released.

## Completed — Requested Account Registration

Codex owns host/invite optional owner-specified one-use codes and existing registration runtime coverage, followed by the explicitly requested single-account setup. Credentials and actual code remain outside source/docs. Base 2f9a27c; clean checkout. Preserve registration password choice, expiry, account locks and default random codes. Integration/deployment owner Codex. Optional custom code is owner-only, hashed, account-bound, single-use and seven-day expiry; same-code retries preserve expiry, registration/lock state rechecked after hashing. Existing random host codes preserved. Full 529 tests, 282 syntax checks and dry-run pass. Runtime 8c21f7c deployed to original Worker ca89f906-91c3-4cd9-979e-92ef68097c87; Verify 44119993068 and demo 44119993098 succeeded. Requested registration identity and alias created without setting a password. Exact requested invite confirmed only after normal deferred actor rollout (earlier requests reached old random-code handler). Local private proof work/account-stick-setup-proof.json excludes code/credentials. No other accounts changed; password selection remains with the registrant. Evidence work/custom-invite-{tests,full-tests,check,build,deploy,ci}.log. Ownership released.

## Completed — Play Ready, Submission and Answer UX

Codex owns Play match rules/audit, Song/Artist UI/CSS, answer search and existing gameplay tests. Base c267755; clean checkout. Opponent answers reveal-only, submission status during guessing. Prominent readiness gate, cancel submission, shared volume, solo/versus results and shortest-first name search. Preserve scoring and private future songs. Local multiplayer QA only; integration/deployment owner Codex. Implemented prominent ready gate above roster, cancel/unlock (server deadline and early reveal enforced, audited), shared Quiz volume, reveal-only mirrored opponent answers/results, solo 1v1 labels, coloured per-song scores, shortest-first word-order search. Current AMQ master has 21,865 individuals and none are missing from existing catalogue. Full 529 tests, 282 syntax checks, dry-run and diff checks pass. Local real Workers/browser sessions for all four formats at 1440/390 pass ready gating, cancel/re-submit, artist list edits, private opponents, complete results and volume persistence with no errors/overflow. Evidence work/play-ready-{focused,runtime,full-tests,check,build,browser}.log, browser-proof.json and gameplay/reveal/results screenshots. No production gameplay writes. Runtime 396dd49986c1539a46ed5ba3e6a816297ea2979a deployed to original Worker f4273849-6dbb-4f24-b758-60cfdcf912e6. Six live assets byte-match; guest browser at 1440/390 verifies NGMC/SongArtist sign-in gates without errors/overflow. First CI found a race in the added runtime test (it matched an earlier unlocked snapshot); test-only a9f3327 now waits for the actual unlock acknowledgement. Final Verify 44118853265 and demo 44118853338 succeeded; no runtime redeployment needed for test-only correction. Evidence work/play-ready-{deploy.log,live-proof.json,live-browser.json,runtime-final.log,ci.log}. No proxy/Host deployment or production gameplay writes. Ownership released.

## Completed — Team Answer Display and Input Separation

Codex owns public/play-team-ui.js, play-song-ui.js and play-song.css. Base 7ee9cd3, clean checkout. Song/Artist 3v3 and 1-Team get shared answer tiles above a separate personal input bar; preserve field claims, Enter submissions, artist edits, reactions and server scoring. 1v1/NGMC unchanged. Local multiplayer/browser verification, no production gameplay writes. Integration/deployment owner Codex. Nine focused gameplay/runtime tests, 281 syntax checks, dry-run and diff checks pass. Local browser checks all four formats at 1440/390; team formats rechecked after markup fix with full-width lower input, three non-input shared tiles, pending/reveal colours, claims, Enter, artist chip edits and fixed reaction counts. No errors/overflow. Evidence work/play-answer-separation-{tests,check,build,browser,team-browser}.log and game/reveal screenshots. Runtime c431d57fe37abfc918fb03a27e56af3626e5af62 deployed to original Worker e6ffe0f8-2755-4481-bc65-20bcadf12e87. Live three changed assets byte-match. Verify 44114471219 and demo 44114471206 passed. Evidence work/play-answer-separation-{deploy.log,live-proof.json,ci.log}. No production gameplay writes or backend rule changes. Ownership released.

## Completed — Quiz Title Colour Families

Codex owns public/features.css premium palettes only. Base ca7b6ae, clean checkout. Keep Singers aqua, Composers violet and Franchise green across standard/premium; brighter pearlescent highlights and existing lightweight gleam distinguish sub-minute achievements. No eligibility, animation mechanics or player data changes. Integration/deployment owner Codex. Desktop/mobile (960/390) six-title visual comparison passes, no errors/overflow; Worker dry-run and diff checks pass. CSS-only change; no new tests. Evidence work/category-title-family-{960,390}.png, browser-proof.json and build.log. Runtime fbd3a1ecb672b099c4e3b026098a93a7c9540ed5 deployed to original Worker version 01963c4f-3418-4cb1-9739-e906b7db6d8a. Live features.css byte-matches; Verify 44112967568 and demo 44112967412 passed. No production data writes. Evidence work/category-title-family-{deploy.log,live-proof.json,ci.log}. Ownership released.

## Completed — Multiplayer Match Review

Codex owns Play room/library/queue audit and unused audio candidates, client activity reporting, host-only review UI/API, focused runtime tests and PLAY.md. Base 91708b7; clean checkout. Preserve current gameplay, economy and solo quizzes. Server-timestamped submissions plus explicitly client-reported visibility/focus events; decoy matches are review signals only, never automatic sanctions. Thirty-day bounded retention. Integration/deployment owner Codex.

Implemented host Match Review with server receipts, answer drafts/submissions/outcomes, rejected retries, browser-reported visibility/focus and connection events. Up to three verified unused audio candidates, shuffled manifests and current-only playback mapping. Conservative decoy flags, no automatic sanctions. Full 529 tests, 281 syntax checks and dry-run pass; final focused 9 tests pass after partial-shuffle optimization. Workers tests cover host-only access, legacy-client refresh, decoy wrong-answer flags, real preload gates, all four formats, reconnect/ratings, one-day gameplay cleanup and 30-day review deletion. Local browser at 1440/390 verifies gameplay and host review in all four formats; initial 1-Team UI interaction encountered a transient replaced DOM element, retried after settled updates successfully. Evidence work/play-review-{full-tests,focused,check,build,browser,team-browser}.log and host/game screenshots. No production gameplay writes. Runtime 1d1b79ffcce70669772f0bb2bc41243c41ba247f pushed/deployed to original Worker version 9a84e0c7-81a2-4e3e-a92d-c9864d3df9a5. Verify 44112237019 and demo 44112237076 passed. Live five changed JS/CSS assets byte-match, host tab present, guest review endpoints 401/no-store, health 200. Evidence work/play-review-{deploy.log,live-proof.json}. No proxy or Host platform deployment, production matches or player-data mutations. Ownership released.

## Completed — NGMC Fetch Compatibility and Premium Contrast

Production PlayQueue logs conclusively identify redirect:error throwing TypeError before network requests. Correct to manual, reject non-OK responses, keep retries and real GR; earlier timeout diagnosis was wrong. Preserve log message label with separate detail field. Test actual Workers fetch path. Composer premium changes violet to icy blue; Franchise premium green to coral/amber for stronger distinction. All 528 tests, 278 syntax checks and dry-run pass. The existing multiplayer Workers test now uses the real loadTourRate/global fetch with an outbound fixture instead of overriding the helper; it verifies all eight seed requests and preserved GR before matching. Redirect rejection is also covered. Desktop/mobile palette comparison passes with six distinct colors, no errors/overflow. Evidence work/ngmc-fetch-fix-{tests.log,full-tests.log,check.log,build.log} and work/category-title-contrast-{browser-proof.json,960.png,390.png}. Runtime 481622bc8db6683df0c1d11f7d0015121fbf1d32 deployed to original Worker version c771961e-d9ca-479e-87d4-2cf72defc048. Verify 44107704591 and demo 44107704508 passed. Live palette CSS byte-matches and public Tour profile request with manual redirects returns 200 in 2702ms. Evidence work/ngmc-fetch-fix-{deploy.log,live-proof.json,ci.log}. No Host changes or production matchmaking writes; new live player joins not synthesized. Ownership released.

## Completed — Quiz Category Title Colors

Codex owns src/quiz.js title projection, public/title-ui.js and features.css category palettes, existing title tests. Composer violet/rose premium; Franchise green/emerald-gold premium; existing Singers aqua/gold preserved. Premium remains perfect 20/20 strictly under 60 seconds. Existing earned titles derive category at read time, no migration or economy mutation. Preserved motion performance controls. All 528 tests, 278 syntax checks and dry-run pass. Desktop/mobile browser verifies six distinct standard/premium colors, no errors/overflow. Evidence work/category-title-{browser-proof.json,full-tests.log,check.log,build.log} and category-title-{960,390}.png.

Runtime 98ae8400ac166e03130857eb156eabf6755cd22c deployed to original Worker version e1d2ee70-7f9e-422c-b326-9aa5d6a73eb2. Live title-ui/features assets byte-match; no production writes. Verify 44106040050 and demo 44106039515 passed. Evidence work/category-title-{deploy.log,live-proof.json,ci.log}. Ownership released.

## Completed — Play Answer Tiles and Lock Times

NGMC Locked (x.xxxs) from server-recorded receipt time since shared song start, immutable on retries and cleared each song; padded self row. Removed 1v1 Team Answers; three Song/Artist answer tiles, mirrored 1v1/3v3 scoreboards, reaction counts below fixed-size buttons. Existing NGMC test extended for timing, client-supplied timing rejection and reset. All 528 tests, 278 syntax checks, dry-run and diff checks pass. Local browser multiplayer all four formats at 1440/390 verifies timings, tiles, mirrored panels, reactions without button movement, retained artist controls/colors, no errors/overflow. Evidence work/play-tiles-{tests.log,full-tests.log,check.log,build.log,browser-proof.json}; screenshots work/play-tiles-{ngmc-ranked,1v1,3v3,1-team}-game-{1440,390}.png. No production gameplay QA writes.

Runtime 6d5561b40e2a3311460d8fc576766197cded39b3 pushed/deployed to original Worker version 760c311b-c409-4f62-b89d-98ed9c8e1f6f. Verify 44104994694 and demo 44104994787 passed. Live guest desktop/mobile checks pass; ten assets byte-match, no errors/overflow, authentication gates intact and no production writes. Evidence work/play-tiles-{deploy.log,live-proof.json,ci.log}. No proxy deployment or economy changes. Ownership released.

## Completed — Initial Quiz Upload Removals

Remove/Restore controls for every matched upload song before first save, included/removed counts, immediate automod refresh, removed Franchise list reward caption. Reuses existing skipAudio save behavior; no server/economy changes. Eleven focused review/audio tests, 27 quiz UI tests, 278 syntax checks and dry-run pass. Real host UI with local API fixtures at 1280/390 verifies working-song removal, duplicate warnings disappearing/restoring, broken-song removal, save payload before any save, sort identity, replacement links and append/pool regressions; no errors/overflow. Evidence work/quiz-upload-remove-{browser-proof.json,tests.log,ui-tests.log,build.log}, desktop/mobile screenshots.

Runtime 52060c7a72f5265ff89b4abc66581abbb393b0ad deployed to original Worker version 72657802-3529-4843-b689-9e2d189f2eed. Live changed assets byte-match, removed caption absent, health 200; no production quiz writes. Evidence work/quiz-upload-remove-{deploy.log,live-proof.json}. First Verify failed only because an old quiz UI assertion required the removed caption; removed that obsolete assertion in test-only 71c571d (runtime unchanged). Demo 44103329149 passed. Follow-up Verify 44103605680 and demo 44103605618 both passed; no redeployment required for test/docs changes. Ownership released.

## Completed — Play Reliability and Artist Lists

Codex owns Play queue/socket recovery, persistent audio preference, artist entry lists and exact group matching, team reveal colors, NGMC lobby icon removal, and snapshots for all four formats. Production logs confirm invalid close codes 1005/1006 and queue calls reaching the former 15-second timeout; the original caught join exception was not logged, so its exact cause is not conclusively proven. Safe socket closure, retryable/coalesced Tour GR lookup, cancellable loading state and sanitized error logging are implemented. No production gameplay mutations or resets.

All 528 tests, 278 syntax checks, dry-run build and diff checks pass. Local multiplayer browser checks cover NGMC (8), 1v1 (2), 3v3 (6), 1-Team (3), desktop 1440/mobile 390: server preference survives reload, exact artist members add/remove/re-add, pending yellow and reveal green/red, no editing after reveal, no overflow/errors. Evidence: surrounding work/play-artists-{browser-proof.json,tests.log,check.log,build.log}; screenshots work/play-{ngmc-ranked,1v1,3v3,1-team}-game-{1440,390}.png.

Runtime 394133e28e65ae4980fd0ea00c8762421b2ff8be pushed/deployed to original Worker version a848f2cd-e8d3-4be4-95e0-fc5e18bb0afe. Verify 44102354997 and demo 44102355020 succeeded. Live guest checks at 1440/390 verify persisted NAW after reload, removed lobby hearts, authorization gate, no errors/overflow; ten assets byte-match and public Tour GR source returns 200. Evidence work/play-artists-{deploy.log,live-proof.json,live.log}. No live matchmaking writes, proxy deployment or economy changes. Exact production join error remains unconfirmed until real-player retry; added logs support diagnosis if it recurs. Ownership released; handoff newer than runtime.

## Completed — Team Answer Roles and Approved Loading UI

Codex owns play-match-rules, Play song UI/CSS, focused rules/runtime/browser coverage and approved loading UI. User approved deployment. Per-song first submission claims one team field; only that owner may revise it until deadline. Claims/reactions reset next song. Song-list dialog exposes revealed songs during play, full selection after finish. Existing matches preserve old rules via persisted teamFields opt-in. No economy changes.

Verified:527 tests pass;277 syntax checks and dry-run pass. Existing rule/runtime tests cover exclusive field claims, other-field/teammate rejection, private opponents, editable owner answers, per-player1 contribution, full20-song scoring, reactions, reset and reconnect. Local browser1-Team (3 players),3v3 (6 players),1v1 (2 players) and NGMC (8 players) pass at1440/390:claim persistence,shared updates,role-disabled inputs,reactions,song-list hidden future entries,Enter submissions,no overflow/errors. Screenshot fixtures in surrounding work/team-roles{-3v3,-1v1}-game-1440.png and390; proof/logs similarly prefixed. Approved loader covers Gacha/Play Quiz, Song/Artist and NGMC waiting. No production mutations; original Worker/bindings retained.

Runtime08f5e6e4851fb7a0fb3e78bc33aaa10af80ab5ca pushed/deployed to original Worker version8eff1cb4-df14-4a9d-8de5-354087a4eeff. Live guest browser1440/390 confirms centered lobbies,20s NGMC/30s SongArtist,sign-in gates,no errors/overflow;10 affected/imported assets byte-match including all loader modules and Quiz integration. No live writes. Verify44098860565 and demo44098858646 succeeded. Evidence work/team-roles-live-proof.json and team-roles-deploy.log. No proxy deployment or binding/schema changes. Ownership released; no remaining local preview or uncommitted runtime work.

## Completed — NGMC Gameplay Refinements

November17. NGMC now has20-second answers, mirrored team cards, authenticated Gacha avatars, counter name badges, revealed per-player answers, Enter-to-lock and a timer bar. Download counts hidden; first12 and subsequent per-song readiness gates verified; remaining tracks continue in pairs. MP3 preflight rejects detected broken/empty/non-audio links before manifest, resampling replacements and caching checks. Only public avatar fields cross into queue/room actors; additive queue avatar column. No ratings/economy changes. All527 tests,275 syntax checks and dry-run passed; eight-browser desktop1440/mobile390 proves12 preloads,20s,Enter/all-lock early reveal,8 answers,7 real image fixtures+initials fallback,2 counter badges,no overflow/errors. Existing runtime test checks malformed audio exclusion and public avatar projection. Evidence surrounding work/ngmc-refinement-{browser-proof.json,game-1440.png,game-390.png,reveal-1440.png,full-tests.log,build.log}. Prior shared loading-bar preview remains local/unapproved and must not be included in this release. No production mutations used for QA.

Runtime5d68e54811804b6b6a63b9f6e0de0227d6bcf46d pushed/deployed from a clean git-archive release artifact, original Worker version62ca0065-684f-4d51-a5e8-83247a5e6445. Unapproved loading-bar files/hunks explicitly excluded; they remain dirty locally. Same eight-player browser QA repeated against exact release; Song/Artist three-player regression passed. Live guest checks1440/390 confirm20s NGMC/30s SongArtist, sign-in gate,no errors/overflow, four JS/CSS assets byte-match; zero production writes. Evidence work/ngmc-refinement-live-proof.json and deploy.log. Verify44096640454 and demo44096640375 both succeeded. No proxy/binding changes. Allow normal deferred actor rollout for running rooms; no forced resets. Ownership released.

## Completed — Loading Bar

November17. Codex owns shared loading-bar UI, quiz download/preparing states and Play song download presentation. Adapt user-supplied Uiverse mrhyddenn3px white bar; real progress when total is known, looping preparation otherwise. Implemented locally in public/song-loading.js, styles.css, features.css, quiz-ui.js and play-song-ui.js. Competitive download bar uses real progress; normal quiz audio preparation loops, hiding once the timer starts; Play keeps the same bar node so transitions survive socket updates. Transform-only animation and reduced-motion fallback.31 existing quiz/audio tests pass, actual Song/Artist browser regression passes at1440/390, preview desktop/mobile no overflow/errors. Animated preview work/loading-bar-preview.gif; standalone work/loading-bar-preview.html and PNG/mobile screenshots. User approved deployment in current task.

## Completed — NGMC Ranked

November17. Implemented NGMC queue/match/UI with8-player balanced4v4,5 lives, exact GR budgets, one eligible count/team/song, per-team0000 refills,35 hierarchical anime/type/song samples and12-track preload. User confirmed separate1,000-start Elo using supplied Downloads/elo.py with INDIVIDUAL_PERFORMANCE=False, tour Usual GR seed then cumulative NGMC GR (no history3 guesses), volunteer counter window2 minutes,8-second choice fallback to lowest Elo, most lives after35/tie draw. Added ts-trueskill5.1.0 with explicit configured global environment and50x display scale; per-song pairwise ratings, not team-win Elo. Detailed rules in PLAY.md. NGMC rating/GR state and idempotent receipts are in existing queue actor; no changes to Gacha economy, Host ratings, bindings or migrations.

527 tests pass including3 focused NGMC rule/selection/Python-reference tests and extended real Workers transport for all4 queues,12-download gate,counter fallback,settlement,reconnect.274 syntax checks,production build and diff check pass. Eight disposable browser players verify12 preloads, manual counters, immutable locks/reveal, desktop1440/mobile390, refresh/no overflow/no errors. Existing Song/Artist three-browser test still passes. Fixed duplicate download/ready chatter triggering socket rate limits; progress now deduplicates/coalesces at100ms. Gameplay snapshots and evidence: surrounding work/ngmc-{game-1440.png,game-390.png,reveal-1440.png,browser-proof.json,browser.mjs,full-tests.log,build.log}, work/song-artist-game-1440.png and matching browser proof. Public Tour profile seed source verified read-only for canonical ID; no production test matches/accounts created. Runtime a6ad69407b81d55229dcaef84749aa15537e7c0b pushed and deployed to original Worker version70444f81-c0c6-4234-91aa-83e160dc85fc. No proxy deployment required. Live guest browser1440/390 for both modes:200,no errors/overflow,sign-in gate intact; all4 changed UI assets byte-match. Public Tour GR source200. Evidence work/ngmc-live-proof.json and ngmc-deploy.log. Runtime demo CI44092644575 succeeded; Verify44092644445 in progress at this handoff. Normal deferred actor rollout can take5 minutes. No production mutations used for QA. Ownership released; handoff newer than deployed runtime.

## Completed — Song/Artist Lobby Cleanup and 30-Second Guesses

November17. Removed the three requested explanatory lines from Song/Artist lobby; rule summary and server round deadline now30 seconds. Countdown/reveal/download behavior retained. Extended the existing duration assertion; all4 focused match/rules/Workers runtime tests pass, changed UI syntax/build/diff checks pass. Runtimee1bb504 pushed and deployed to original Worker, versionf4d92a20-9859-4c8f-aa01-200367433676. Live UI asset byte-matches source; read-only browser1440/390 confirms removed text,30s label, no errors/overflow. Evidence work/song-artist-30s-live-proof.json. Existing active round deadlines are persisted; subsequent rounds use the new duration after normal actor rollout. No proxy deployment or production gameplay QA writes. Ownership released; handoff newer than deployed runtime.

## Completed — Song/Artist Multiplayer

November17. Codex owns new public/play-song-* and src/play-* modules, Play shell integration, quiz-library sampling/catalogue extension, worker authentication/WS routing, additive Durable Object bindings, focused runtime/UI checks. User confirmed 1v1,3v3 and three-player one-team; shared teammate answers, team up to3 points/song plus individual correct contributions,20 random AMQ+ songs, first10 downloaded by everyone before start. Other new modes remain placeholders. Preserve Gacha/Host state and quiz behavior. No other collaborator edits observed at start.

Implemented separate hibernating queue/room actors, same-cookie authenticated upgrades, roster-authorized room IDs, persisted timers/results, reconnects and readiness resets, queue leases, rate limits, shared drafts and private opponents, immutable locks and one-day room retention. No credit/Elo awards. Public catalogue is independent name lists, served via metadata actor/edge cache; search runs off the main thread with70ms debounce and20 visible results. Artist alias/group rules follow supplied Voicing Mode2.0.0; snapshot version20261113150503-138. First10 downloads gate readiness; last10 download in pairs, later gaps pause the shared countdown. Audio decodes during countdown; displayed clock uses ping round-trip correction. Existing Quiz and Gacha remain independent.

All524 tests pass,269 syntax checks, main/proxy dry runs and diff checks pass. Four focused tests cover artist relationships/search, all scoring/timing states, and real Workers WS authentication/proxy/three queue formats/first10 gate/reconnects. Disposable three-browser test1440/390/390 confirms exactly10 downloads before start, deferred remaining downloads, dropdown Enter/typing, shared answers,3 team points and3 contributions each, refresh recovery and no JS errors/overflow. Evidence in surrounding work/song-artist-{browser-proof.json,browser.mjs,all-tests.log} and screenshots. Fixed ready-play being interrupted by a loading-state pause. Bundled-library benchmark:33,413 playable groups,13,527 anime/33,885 artist/31,154 song names,1.7MB autocomplete JSON; local build226ms.

Runtime052e21db7f31c0f3ec13a9b017e214d122508235 pushed/deployed: original Worker versiona47d742f-64f1-4720-a451-d63187a9ed45; `play` proxy versionc1dac452-74dd-4ae2-815e-349989abcd22. Existing GAME/QUIZ_LIBRARY/QUIZ_SESSIONS namespace IDs unchanged; new PLAY_QUEUE/PLAY_MATCHES added. All6 changed/new JS/CSS/metadata assets200 and byte-identical; live catalogue200 uses active refresh-71418b5b-250a-4c5a-baa1-1739f110ecb6 with the same name counts. Real guest browser1440/390/360 verifies all format choices, authentication gate, catalogue load, no errors/overflow and zero writes. Evidence work/song-artist-live-{read.json,guest-proof.json} and screenshots. Exact-source Verify44084812397 and demo44084812134 both succeeded. Waited for normal deferred Game rollout: new play-connect authorization rejection confirmed2026-11-17T12:42:34Z, without resets/redeployment; Play/Gacha/Host pages200. No production test accounts/matches/economic mutations, no Host Platform source/deployment changes. Ownership released; final handoff newer than deployed runtime.

## Completed — AMQ Tours Play

November17. User requested amqtours.app/play with NGMC Ranked,2v2 Arena,Song/Artist,Speed Showdown,Quiz; clarified layout first and new modes later. Codex owns new Play shell/navigation/state projection, worker shell route, short-url proxy and mount config, focused tests. Reuses existing Quiz module/API/account session through /gacha; preserves existing Gacha Quiz, scores/rewards, GAME identity, Host Platform and routes. First4 explicitly Coming Soon. Desktop sidebar/mobile5-button navigation, shared credits/avatar/crop/enhancement effects/titles, auth/recovery and English/Romaji preference. Compact `play-state` skips starter/market/settlement work and never returns inventory/password/code fields. Original assets route config runs Worker first on Play paths; proxy forwards them without stripping their prefix and keeps cookie isolation/Host-header stripping.

All520 tests pass (one new route test; existing proxy/runtime tests extended),256 JS syntax checks, original+proxy dry-runs and diff checks pass. Real Workers runtime verifies6 Play URLs and dev/canonical base paths, invalid404/index redirect, guest/auth header scope and zero market/scheduler/starter calls. Actual app/disposable SQLite at1440/900/390/360 verifies navigation/back/forward, all categories, shared scoped session, preferences, search caret, boundedMAX avatar, playback/answer/progress, leave/resume/Stop/sign-out and no overflow/errors or full-state reads. Preview evidence: work/play-home-*.png, play-quiz-*.png, play-browser-proof.json, play-runtime-tests.log, play-all-tests.log.

Runtimedbd9fe8ffc1384b563dfc447cf2e08dee3100ce0 pushed and deployed to original Worker, version977a4d9b-d311-4c08-b044-861b676e1746. Waited for the normal5-minute DO rollout until anonymous play-state returned200, then deployed the `play` proxy, version40d83e4d-da0b-48d2-b996-a71507ea54a5. Cloudflare confirms existing2 Gacha plus2 new narrow Play route patterns. Root `/play` redirects to `/play/`; all mode pages200 with the correct base,3 JS/CSS assets byte-identical, guest API200, Gacha and Host profile200. Canonical `/play/?x=1` works; documented the platform's exact bare-root query limitation rather than widening the route to capture unrelated `/players` paths.

Live frontend at1440/900/390/360 repeats full local-SQLite/intercepted-API integration assertions; separate real guest checks1440/390 load174 published Singer quizzes,3 categories, no errors/overflow and zero POSTs. Evidence: work/play-live-read-proof.json, play-live-browser-proof.json, play-live-guest-proof.json. Exact-source Verify44076075038 and demo44076075067 both passed. Existing GAME/Quiz actors, service binding, secret and account/cookie scopes preserved; no production gameplay QA writes or data copying. Host Platform source/deployment unchanged. Ownership released; handoff newer than deployed runtime.

## Completed — Quiz Song Progress Squares

User approved implementation/deployment. Codex scoped src/quiz-run-state.js, public/quiz-ui.js/features.css and focused existing tests. Approved strip is horizontally centered directly above hotkeys, no visible labels,20 squares, green/red/yellow/neutral. Server scoring unchanged; future answers remain private.

November17. Implemented approved preview in actual gameplay and finished results. Shared quizRunView returns only already-submitted boolean outcomes for normal and competitive transports; no schema/state/scoring/reward changes. Fallback keeps already-seen results during old/new deployment overlap. Instant-next carries results forward; restart resets them. Styles match the final approved preview (centered, directly above hotkeys, no labels,20 squares in one row).

All519 existing tests pass with cases extended (no added test count), including normal/competitive Workers runtime results.252 JS syntax checks and Wrangler dry-run pass;27 UI tests rechecked after extra optimistic-transition assertions. Actual app/disposable SQLite at1440/390/360 verifies exact layout, answer reveal, next, reload, skip and restart, with no overflow/errors. Evidence: work/quiz-progress-browser-proof.json, quiz-progress-implemented-*.png, quiz-progress-all-tests.log.

Runtimeac5f21ed4da4d6ed627d04f9a14d3a42124d44bd pushed/deployed to original Worker at100%, version75d4cc43-9f68-4820-a91f-c22b6bd2749b. Live quiz-ui.js/features.css return200 and byte-match source. Cloudflare code download confirms both submitted/finished results projection. Live frontend browser checks at1440/390/360 use intercepted API responses backed by local SQLite (no production quiz attempts/writes); all lifecycle/layout assertions pass. Evidence: work/quiz-progress-live-browser-proof.json. Existing bindings/state preserved. Ownership released; documentation handoff newer than runtime.

## Completed — Franchise Quiz Category

November17. Codex owns quiz category/reward rules, quiz browsing/host/profile labels and focused existing quiz tests. Franchise is the third category in browsing and host creation/editing; shared category labels cover profile #1 tables and automod. Server settlement suppresses improvement/milestone credits while preserving scores, leaderboards, timings, favorites, titles and reward-history protection. Browsing/start/completion show No Credit Rewards; Franchise hides the credit payout guide. No schema migrations or historical credit changes.

All519 tests passed with existing cases extended (no additional count),252 JS syntax checks and Wrangler dry-run passed. Final UI-only guide adjustment passed27 UI tests and repeat dry-run/browser checks. Local SQLite real app at1440/390/360 verifies category isolation,1/2 completion, credit-free start/results, selected host category, no JS errors or horizontal overflow. Reward tests cover first runs/improvements/repeats/score reset, unchanged wallet/earned/ledger, titles and leaderboard/profile scores. Evidence: surrounding work/franchise-browser.mjs, franchise-browser-proof.json, franchise-*.png, franchise-tests.log.

Runtime5685240a2c5069c6efe4b56998d09c4593840816 pushed/deployed to original Worker at100%, version6932b4b6-152e-45f9-af4c-159acfbea843. Read-only live verification confirms all5 changed assets200 and byte-identical; guest mobile Franchise tab selects correctly with no errors/overflow. Cloudflare code download verifies the zero-credit policy and server category argument. Existing bindings/state preserved; no production test attempts or data writes. Evidence: work/franchise-live-proof.json. Ownership released; handoff newer than deployed runtime.

## Completed — Quiz Host Tools Illegal Invocation

November17. Codex scoped src/quiz-library.js and the existing quiz-library test. Confirmed native fetch receives QuizLibraryCore as its receiver during masterlist refresh: isolated workerd reproduces the exact Illegal invocation error before outbound I/O, then returns200 with one mocked outbound request after wrapping the callback. Existing staged-refresh test now asserts an unbound receiver for both upstream calls and fails before the fix/passes after; all4 existing library tests pass,252 JS syntax checks and Wrangler dry-run pass. Evidence: surrounding work/quiz-library-native-fetch.mjs and quiz-library-fetch-{before,after}.json.24h observability search returned no matching events; do not claim production log confirmation (the job catches/persists upstream errors).

Runtime40e2109837c206eeb4890713edd9dd7bb4309ab3 pushed and deployed to original Worker, version29cc939e-3a75-40fe-b3dc-65b6fb485c40 at100%. Cloudflare read-only code download confirms the wrapper in the deployed bundle; canonical Gacha root and host route return200. Existing bindings/state preserved. Scope is callback invocation only; QA made no production masterlist/job/quiz/gameplay writes. A refresh paused after6 errors may require the host to press Resume Refresh; do not automatically restart jobs for validation. Exact-SHA demo CI44057518822 and application verification44057519040 both passed. Ownership released; this documentation commit is newer than deployed runtime.

## Completed — Hide Tradeables and Perfect Quizzes

November17. Codex owns alchemy material-picker checkbox, Quiz Hide20/20 filter, app wiring and responsive styles. Hide Tradeables defaults off, composes with Hide Protected/search/type/rarity before material pagination, and hides cards explicitly marked for_trade (the broad Collection definition includes every unprotected card and would hide all usable materials). The user was asked for preference; marked-only is the stated default assumption. It does not alter the queue, Auto Refine or economic protections. Quiz Hide20/20 defaults off, saves a browser preference, composes with search/category/sort/Favorites First, and leaves completion totals unchanged. Generic filtered-empty status avoids an empty search quote.

41 existing Quiz/Alchemy UI/search tests pass with existing cases extended; syntax/diff and Wrangler dry-run pass. Actual app/disposable SQLite at1440/390/360 verifies both controls, marked-only/material protection combinations, quiz search/favorites, persistence on reload, unchanged completion totals and wallet/inventory, with no errors/overflow. No new test count or backend/data changes. Evidence: surrounding work/hide-perfect-tradeables-proof.json and hide-{perfect,tradeables}-*.png. Runtime `dc4d156` pushed/deployed to original Worker, version `c7565664-bd21-414f-ac8c-a5ce4b76a332`. All5 changed assets return200 and byte-match source; no production preference/gameplay writes. Evidence: hide-perfect-tradeables-live-proof.json. Existing bindings/state preserved; ownership released.


## Completed — Mobile Shell Stylesheet Recovery

November17. Codex owns mobile-navigation.js/mobile.css/index.html in both apps. Reproduced screenshot failure with mobile.css blocked:128px natural logo, old navigation and unstyled new brand. Logo now has intrinsic26px dimensions plus explicit maximum size. Mobile shell builds only after its stylesheet marker is applied; pre-ready renders queue safely. One failed-style retry uses a distinct query; persistent failure keeps legacy navigation without inserting unstyled shell. Mobile stylesheet gets v2 URL and precedes Gacha app module. No reload loop, service worker, storage or gameplay change.

Local fixtures in both apps reproduce baseline and verify normal/reloaded, delayed, initial failure/recovery and persistent failure (exactly2requests). Logo remains26px even when stylesheet is disabled after shell creation. Actual Gacha/SQLite browser360/390/430/850/900/1440 passes menus/preferences/filters and desktop pixel comparisons; no page errors/overflow or balance/inventory changes. Focused existing route/preference checks, JS syntax, diff and dry-run pass. No added repository tests; production QA remains read-only. Evidence: work/mobile-logo-proof.json and mobile-gacha-checks.json. Runtime `a3416d75e5c6d3cbe420a5c4700a1fb2bf274968` pushed/deployed to original Worker, version `59939ac8-8a37-47d9-b527-3841e9570db9`. Host version91/source `0192a978037a4feef154c161e4506550ed492c80` deployed successfully (`appgdep_6afbe934ac848191a0f235142bba84c0`). Both live apps verify26px logo across reloads; intercepted stylesheet failures preserve legacy navigation and retry exactly once without JS errors. Four changed assets200 and byte-identical. No production state writes. Evidence: work/mobile-logo-live-proof.json. Ownership released; handoff newer than deployed runtime.


## Completed — Premium Title Scroll Performance

November17. Codex owns mirrored premium-title CSS and title-motion.js only. Removed per-frame gradient-angle animation and oversized shimmer texture; gold/opal border remains static, smaller glow and a transform-only8s shimmer preserve premium styling. IntersectionObserver runs shimmer only in view, pauses during document/nested scrolling and hidden tabs, resumes after160ms idle; DOM additions/removals are batched and text-only updates ignored. System/On/Off semantics preserved. No title data, scores or rewards change.

Local Chromium390px/DPR2/4×CPU120-title fixture: baseline idlePaint6292/635.2ms and scrollPaint5203/929.5ms; updated measured segments both0Paint. Scroll style updates fell1387.7ms→74.8ms. These are synthetic desktop-emulated traces, not measurements on the user’s phone. Both apps at390/1440 verify moving shimmer, scroll pause/resume, offscreen and hidden pause, dynamic insertion, motion settings and no overflow/errors.12 focused existing Gacha title tests plus Host identity test, JS syntax and Wrangler dry-run pass; no new repository tests or production QA writes. Evidence: surrounding work/premium-{before,after}-*-trace.json, premium-perf-{before,after}.json and premium-perf-behavior.json. Native Firefox160 also verifies the transform shimmer advances with explicit On while Windows reports reduced motion. Runtime `9ad15a8f09fa22cc3f64f0daffbba6eb03d4e92d` pushed/deployed on original Worker, version `a146009a-75eb-4efd-9c12-eaeeff2309cd`. Exact-source Verify application43995342868 and demo43995342999 CI passed. Mirrored Host version90/source `4c5fa015936a17a32caa8b10cf73f6807441db87` deployed successfully (`appgdep_6afbacfce0fc8191933483f7c9cb4b64`). All4 changed live assets byte-match source; public guest mobile/desktop browsing has no errors/overflow. Evidence: premium-perf-live-proof.json and premium-perf-firefox-after.json. Production accounts/preferences/gameplay untouched. Ownership released; handoff newer than runtime.


## Completed — Hosting Reward and Title Motion

November17. Codex owns participation UI/shared quote/server validation, currentHost metadata, browser-local title animation preference and related existing tests. Receive Host Credits defaults off and adds a fixed2,000 outside the batch multiplier to the authenticated host only; no client-selected recipient. Atomic batch, idempotency replay, one hosting reward per tour event and account-lock/admin checks preserved. Token-only tools cannot claim hosting credits. Signed-in account attribution takes priority when a legacy host token is also supplied. Hosting uses Other grant ledger plus hosting tour_events marker, with existing credit audit.

Firefox160 on this desktop reports prefers-reduced-motion:reduce; no title animations ran in the baseline fixture. Settings → Title Animations adds Follow Device Preference(default)/On/Off, browser-local and shared by same-origin Host. On explicitly overrides reduced motion for title effects only; Off disables them. Firefox native headless verified animated rainbow positions and premium border angle with On; Chromium responsive UI verified preferences, state after reload, checkbox default/quote and escaped Host labels. All519 Gacha tests,252 syntax checks and dry-run pass; existing host-credit runtime additionally verifies delegated recipient, forged host rejection, replay and duplicate/token-only denial. No added test count. Local-only fixtures and no production writes. Runtime `7f504324a84791ac7aa84af8ccdab0a09aa0a97c` pushed/deployed on original Worker, version `b4137a2d-e27b-41e1-b617-1a9e020de359`. Exact-source Verify application43983746967 and demo43983746691 CI succeeded. Host version89/source `d1912a123ad79de19f86ae57ec856e1300c7effa`, deployment `appgdep_6afb98baa1888191949e8204b7f03064` succeeded; all113 Host tests pass.12 changed live assets byte-match and health/tour/completed-list endpoints200. Current imported tour sample lacks host metadata; those labels deliberately remain Host Not Recorded. No historical records were edited. Evidence: surrounding work/host-credit-title-{ui,live}-proof.json, title-firefox-{before,after}.json, hosting-tests.log and host-names-tests.log. Existing bindings/accounts/wallets/data preserved; ownership released. This handoff is newer than runtime.


## Completed — Remove Repeated bop Cost

November16. Codex removed the small bop image/cost beside each alchemy tier XP progress counter, as requested. Ordinary XP progress, bop draw buttons, hover cost, confirmation and balances retained. Removed the three unused alchemy-bop-cost CSS rules.12 existing alchemy UI tests, diff check and Wrangler dry-run pass; no new tests or backend/data changes. Runtime `0d190c7` pushed/deployed on original Worker, version `ceccb1b0-fa18-4762-8046-ab4ad400c54a`. Both changed live assets200, byte-match and contain no retired cost markup/styles. No production QA mutations; ownership released.


## Completed — Mobile Header Avatar Proportions

November16. Codex owns a scoped mobile.css fix after the approved mobile release. At390px a MAX header avatar was29px with a4px computed border and only21px of portrait; the36px button background was visible as an extra ring. Header avatars now fill36px with a2px maximum border and32px of portrait; their button background is transparent only when a portrait frame exists. Glow, level badge, saved crop, other avatar contexts and desktop rules remain intact. Local browser fixture verifies levels1/2/6 at390/850 and unchanged desktop measurements at1440; diff checks pass. No added tests, no backend/data changes. Wrangler dry-run passed. Runtime `d089278` pushed/deployed to original Worker, version `54fa11e9-2cc5-440b-b195-9da098a4c452`; live custom-domain mobile.css200 and byte-identical at12:48Z. Evidence: surrounding work/avatar-mobile-{before,after}.{json,png} and avatar-mobile-live.json. Production accounts/preferences/gameplay untouched; ownership released.


## Completed — Approved Mobile Navigation

November16. Codex owns mobile-only shell/styles, navigation integration and validation/deployment in this checkout. Approved previews are being integrated in Gacha and separately in Host. Gacha bottom navigation is Home, Profile, Quiz, More; Packs moves to Collect. Desktop styles and all production gameplay/data remain unchanged. Local fixtures only; no concurrent task claimed.

Implemented mobile-navigation.js/mobile-filters.js/mobile.css and app/index integration; no preview source or sample data included. Browser checks with disposable SQLite cover360/390/430/850 mobile and900/1440 desktop, guest/signed-in/host menus, all navigation links, filtering, quiz search/favorites/song popup, account popup, preferences and mobile→desktop resizing. Desktop screenshots match (one antialias pixel at900); no overflow or page errors; wallet/inventory unchanged.28 focused existing tests and251 syntax checks pass, Wrangler dry-run passes. Host has separate permissions/browser checks and17 focused tests; its desktop screenshots match exactly. No additional repository tests. Gacha runtime `d443ad94d83adebd481dc341536db9eaebfa3915` is pushed/deployed to original `amqtours-gatcha`, version `51f2d1c6-40f9-42dc-9e1e-d400b5305e6c`. Exact-source Verify application43867321994 and demo43867321976 CI both succeeded. Public custom-domain assets match source, and guest mobile browser verifies Home/Profile/Quiz/More, Packs under Collect, Rankings last, no overflow/page errors and desktop sidebar on resize. No live writes. Separate Host release tracked in surrounding work/mobile-live-proof.json and host-mobile-release files. Existing bindings, named economy, cards, wallets, accounts and records unchanged. Ownership released; this handoff commit is newer than deployed runtime.


## Completed — Favorite Heart and Unclipped Glows

November16. Codex owns integration/deployment on main, base6573aa6. Scope: remove quiz favorite status dot; give avatar/card scroll lists sufficient halo room without changing effect strength, crop, saved state or scroll access. Focused existing tests and local desktop/mobile browser fixtures; no production mutations. No concurrent task claimed.

Implemented locally. Removed only the SVG status circle and its unused CSS; selected heart styling and favorite persistence remain intact. Reproduced the screenshot in Friends (0px left clearance) and Collection pop-ups (10px). Added horizontal bleed and internal scroll padding, plus person-row insets (40px clearance), and matching gutters in trade picker, trade notices and legacy order lists. Vertical padding stays inside each bounded scroll viewport, preventing content from overlapping pager controls. Frame colors, strength, animation and avatar crop unchanged. No backend/schema/economy change.

Validation:39 focused existing Quiz/Trades UI/Showcase tests pass (no new cases),249 syntax checks, Wrangler dry-run and diff checks pass. Desktop/mobile local browser at1280/390 covers Friends, Collection, Rankings comparison, trade picker/notices and order list, all last items reachable, no overflow/errors. Actual application/SQLite at1440/390 verifies heart-only SVG and saving favorites without changing balance/inventory. Evidence: surrounding work/glow-{before,after}-*.png, glow-after-proof.json and heart-no-dot-proof.json. Runtime `360699b1f00dd82888e9aa4aad044e99ab3b66ab` is pushed/deployed to original Worker `amqtours-gatcha`, version `b0248fb9-8178-4f6f-8b7a-2ac27495dd00`. Exact-source Verify application43855298657 and demo43855298678 CI passed. Live at11:11Z: both changed assets200/byte-match and health200. Guest mobile browser verifies no SVG status circles and opens the public Collection pop-up through a Wishlist card; its scroll gutter is20px and first avatar has40px left clearance, without overflow/errors. Friends and card-list scrolling are verified with disposable local fixtures; no production friendship/favorite, inventory, wallet or other gameplay QA mutation. Existing configuration/bindings unchanged. Ownership released; no implementation remains. This documentation commit is newer than deployed runtime.

## Completed — Wishlist Toolbar and Bidirectional Sorts

November16. Codex owns integration/deployment on main, baseb5694da. Scope: shared profile card filters/Wishlist search, rarity, role and Exclude Owned; server filtering/pagination/privacy; opposite numeric/date/name/role sort choices across Gacha browsing and order editors, with demo parity and focused checks. Exclude Owned uses the wishlist profile owner’s inventory/escrow, while private ownership stays hidden. Preserve wallets/cards/receipts and existing order; all QA mutations local only. No concurrent work claimed.

Implementation complete locally. Shared Collection/Wishlist toolbar uses the same responsive controls, search debounce/caret retention, combined filters and empty-state styling. Exclude Owned checks inventory and marketplace/auction/trade/offer holds plus unclaimed auction wins; private foreign ownership remains hidden and exclusion is rejected. Reverse sorts are wired through server validation, global ordering before pagination, browser demos, card order editors and quiz browsing. Existing saved orders and production records are preserved.

Validation: all519 existing tests pass with focused cases extended (no additional test count), including actual Workers SQLite for nested escrow exclusion. Disposable SQLite/full-browser checks at1440/390 verify aligned toolbar controls, combined filtering across30-card pagination, search caret, role reset, exclusion of all owned/held variants, public wishlist/private ownership protection, reverse order editing and Collection/Catalogue/Shop/Trades/Quiz dropdowns. Inventory/balance unchanged; no page errors or overflow. Evidence: surrounding work/wishlist-toolbar-browser-proof.json, wishlist-toolbar-{1440,390}.png and wishlist-toolbar-tests.log. All249 JavaScript syntax checks, Wrangler dry-run build and diff checks also pass. Runtime `fcc5c5728fada7c409198e50155e39474e05d468` is pushed/deployed to original Worker `amqtours-gatcha`, version `3d71af5a-9c6c-48a6-9b9b-27cfdd583b84`. Exact-source Verify application43853164336 and demo43853164403 CI passed. Live at11:01–11:02Z: all12 changed browser assets200/byte-match, health200, public Wishlist ownership metadata/exclusion and reverse Catalogue sort200. Guest mobile browser verifies shared Wishlist toolbar, reverse Wishlist/Quiz options, no errors/overflow. Private exclusion rejection and all holds are verified locally/Workers SQLite, not through production mutations. Ordinary deferred backend adoption completed without reset/redeploy. Existing bindings, named instances and migrations unchanged. No live account, wallet, inventory, saved order or gameplay QA mutation. Evidence: surrounding work/wishlist-toolbar-live-proof.json and wishlist-toolbar-live-390.png. Ownership released; no implementation remains. This documentation commit is newer than deployed runtime.

## Completed — Working-title Popups, Last Pachinko Game, Quiz-name Automod and Approved Pulse

November16. Codex owns integration/deployment on main, baseea4e7ef. Scope: public quiz tooltip/songlist, Pachinko selection preference, host duplicate-name warning and focused existing tests/docs. Preserve gameplay, wallet, scores, quiz import semantics and other pending design choices. No backend/economy/schema changes intended; QA uses local fixtures only. No concurrent work claimed. User also approved Pulse, the third quiz-favorite design, during this task.

Implementation complete locally. Native title hints are replaced by one page-lifetime floating popup controller with hover/focus/tap, escaped text, viewport/table clipping checks, Escape/outside dismissal and render cleanup. Pachinko validates and saves the last game in browser storage; failures fall back safely to the in-memory choice. Host quiz-name automod checks the already-loaded protected summary index across categories/statuses, excludes the current ID and normalizes Unicode width/case/spacing. Warnings update without network requests or replacing the form/caret; intentional duplicates remain allowed. Approved Pulse SVG/status light replaces the circular heart control, preserving the existing account favorite operation. No backend/schema/economy change.

Validation:42 focused tests pass with existing tests extended (no new cases),249 syntax checks, dry-run and diff checks pass. Disposable SQLite/full-browser at1280/390 verifies all working titles, escaped metadata, hover/touch/keyboard and sort/scroll/close cleanup; Pulse save/style; all6 games across reloads, navigation back to the last game and invalid-storage fallback; duplicate draft/published names, self exclusion, live typing/caret, pool automod and unchanged inventory/balance. No errors/overflow. Evidence: surrounding work/quiz-hints-* and quiz-working-popover/quiz-pulse/quiz-name-automod screenshots. Full519 tests also pass. Runtime `5e2522ef433a0cb1690dd7f2208d1737ad7b8d99` is pushed/deployed to original Worker `amqtours-gatcha`, version `bb6e75ee-d71a-42a7-b470-2f359a2cc7f6`. Exact-source Verify application43849722154 and demo43849722180 CI passed. Live at10:33Z: all8 new/changed assets200/byte-match, health200, protected host quiz index401. Guest mobile browser verifies the frameless Pulse SVG, immediate working-title tap popup and Escape cleanup, last-game preference after reload, no overflow/page errors. Host-name warnings/favorite writes were tested with disposable local state; no production preference, favorite, quiz, gambling, wallet or inventory QA mutation. Only the guest browser’s local game preference changed. Existing bindings, instances and migration configuration are unchanged. Ownership released; no implementation or heart-design choice remains pending. This documentation commit is newer than deployed runtime.

## Completed — Profile Friend Placement and Alchemy Card Inspection

November16. Codex owns integration/deployment in this main checkout, base4494497. Scope: profile tab markup/styles, alchemy selection UI and click wiring, focused existing tests and documentation. Move Add Friend outside the tab border; selected queue cards populate Selected Card without changing refinement order. Preserve all production state and other pending design choices; local-only mutation fixtures. No concurrent task claimed.

Complete locally. Add Friend is a sibling outside the bordered nav, keeping desktop alignment and mobile wrapping. Queue cards have a native inspection button separate from drag/remove controls; Selected Card follows the stable copy key across reordering, displays its current slot and corresponding standard/lucky XP odds, and falls back to the first remaining copy after removal. Inspection leaves refinement requests/order unchanged and keeps keyboard focus in the current page/picker. No backend, schema or economy code changed.

Validation:57 focused existing tests passed with one behavioral test extended,248 syntax checks, dry-run build and diff check passed. Disposable SQLite/full-browser checks at1280/390 verify friend placement and click state, pointer/keyboard inspection, queue unchanged on inspection, slot/odds updates through keyboard and mouse/touch drag, selection removal fallback, picker focus/selection persistence, correct refinement confirmation and unchanged wallet/inventory. No page errors or overflow. Evidence: surrounding work/selected-card-* and profile-friend-outside-* screenshots/logs. Runtime `5876323fcdce7b7a8dd15ac3604bc144a92bbb14` is pushed/deployed to original Worker `amqtours-gatcha`, version `aa8a81e1-7f7c-4fdc-a03f-285853ebc040`. Exact-source Verify application43845195385 and demo43845195358 CI passed. Live at10:03Z: all4 changed assets200/byte-matched, health200; guest mobile profile confirms the friend control outside nav with no overflow/page errors. Alchemy selection and refinement confirmation were verified locally with disposable state, not through live gameplay mutations. Existing bindings, instances, migration configuration and production records preserved; no backend changes or adoption-dependent API introduced. Ownership released; no remaining implementation. Previous quiz-heart previews remain awaiting a user choice. This documentation commit is newer than the deployed runtime.

## Completed — Cancel Individual Pack Auto-sales

November 16. Codex owns integration/deployment in this main checkout, base 2a0e758. Scope: pack grant/cancellation records and reset/identity lifecycle, pack-result actions and summaries, demo parity, focused existing tests, collaboration docs. Put Cancel Auto-sell first and restore only that pulled copy for its original credited price. Preserve settings and production economy; mutations tested locally only. No concurrent feature task claimed.

Complete locally. Each new auto-sold pull has an owner-bound server record with its original credited price; cancellation runs with its receipt in the existing synchronous transaction, restores one copy and cannot be repeated with another key. Insufficient funds, foreign/unknown IDs and locked accounts reject safely. Identity migration/reset cleanup and browser demo parity included. Cancel Auto-sell is the first pack action; cancellation updates that copy, totals and credits without replacing the card/page or changing settings. Older responses without a ticket remain informational; no historical sale reconstruction or production QA mutation.

Validation: all519 tests pass (one focused new regression),248 syntax checks, dry-run build and diff check pass; final compact UI guard passed14 focused tests and syntax again. Existing Workers SQLite fixture verifies the real transaction/runtime and retry. Disposable SQLite/browser at1280/390 verifies top placement, touch reveal without accidental action, exact per-copy debit/grant, injected network failure/retry, rapid duplicate clicks, Protect after restoration, unchanged sold duplicates/settings, insufficient funds and pagination retention, without page errors/overflow. Evidence: surrounding work/pack-autosell-* files. Runtime `b77c2196776e10fab1e77250fd217f3784332875` is pushed/deployed to original Worker `amqtours-gatcha`, version `e1316ba3-de2f-4268-9ba4-b0fc847f6cc6`. Exact-source Verify application43843871215 and demo43843871413 CI passed. At09:54Z, all5 changed browser assets returned200 and byte-matched release source; health200 and anonymous cancellation401. Backend cancellation is verified in disposable SQLite and the actual Workers SQLite runtime; no live cancellation, purchase or inventory/wallet QA mutation was performed. Existing GAME/Game/named economy, bindings and migration configuration preserved. Active actors use ordinary deferred adoption; no reset or unchanged-source redeploy. Ownership released; no implementation remaining. Pending quiz-heart design choice from the previous task remains unchanged. This documentation commit is newer than deployed runtime.

## Completed — Heart Design Options, Profile Friend Placement, Unique Card Titles

November16. Codex owns main integration/deployment, base43d3d3f. Scope: three local HTML/SVG heart previews for user choice (not deployed); move the profile friend control immediately after Quiz; enforce one earned title per player/card ID, consolidate existing duplicate display with visibility/order preservation and retain award history. Distinct cards sharing a name and quiz titles remain separate. Preserve existing production inventory, wallet, receipts, title history and historical migration markers. No historical replay or production QA mutations. Integration/deployment owner:Codex.

Complete locally. Existing duplicate awards collapse on read to the earliest stable award, preserving any equipped repeat and the earliest saved group position. Group visibility saves update all historical rows; new MAX claims use indexed NOT EXISTS and do not report another unlock. No award deletion, title regrant or migration replay. Profile control sits immediately after Quiz inside a shared wrapping group. Full518 tests,248 syntax checks, build and diff checks pass; existing stale repeat-award expectations updated, one focused historical-group regression added. Local desktop/mobile browser verifies placement, distinct same-name card/quiz titles, consolidated visibility save/reload and retained history/balance. Three interactive code/SVG heart designs (Orbit/Facet/Pulse) are preview-only outside public assets: surrounding outputs/quiz-favorite-options.html and .png; click/keyboard and mobile layout verified. Evidence: work/unique-card-titles-* and unique-titles-*.

Runtime `0f82ee9e7a24eecb0c8b0c93d6cdd89f1da779b0` is pushed/deployed on original Worker `amqtours-gatcha`, version `f06e617e-1c41-48e9-b107-462ea68622ba`. Exact-source Verify application43840728923 and demo43840728857 CI passed. Live09:38–09:39Z: three changed browser assets byte-match, unchanged quiz-ui.js also matches, health200 and guest My Titles401. At348seconds after deployment, public-profile mobile browser confirms the friend control immediately right of Quiz on the same row, absent from heading, without page errors/overflow. Three sampled public profiles had no equipped card titles; historical-duplicate consolidation/new-award rejection are verified in disposable local/runtime checks, not claimed as observed mutations of a live account. No production title/equipment, inventory, wallet or account QA mutation. Original bindings/instances/migration configuration preserved; ordinary deferred adoption window allowed without reset/redeploy. Ownership released. Pending design choice only: user selects Orbit(1), Facet(2) or Pulse(3) before changing live quiz hearts. This handoff commit is newer than deployed runtime.

## Completed — Friends, Social Filters, Profile Quiz Sorting and Approved Alchemy Layout

November16. Codex owns main integration/deployment, basec438f25, in this checkout. Scope: additive per-account directed friendships and opt-in quiz alerts; profile/Players/account-popup controls; server-side friends filters for rankings, quiz leaderboard, collectors and player listings; profile quiz table sorting; approved compact alchemy queue/sidebar UI. Friends means outgoing adds (including mutual); leaderboard filters include self. Incoming count reflects who added that profile. Preserve privacy, reward/score authority, receipts and all production state. No historical operations or production QA mutations. Owner/deployer:Codex; no parallel agent work.

Complete locally. New `player_friends` table/index and default-off `players.notify_friends_quiz`; incoming counts and mutual states use indexed, batched lookups. Friends writes/list reads bypass starter/market/scheduler/full-state work. Filters precede sorting/pagination and retain private collection/balance restrictions. Published final best improvements notify opted-in outgoing followers only on crossing their own saved best; time tiebreaks supported, unchanged/replayed/already-ahead/preview cases suppressed, global #1 notice deduplicated. Canonical migration updates both edge ends. Gameplay-only resets preserve these account relationships; registry deletion clears them. Settings/read metadata and demo parity included. Profile #1 headers sort Quiz/Category/Time; explanatory footer removed. Approved alchemy queue/sidebar applied, with visible handle capture for page/picker touch ordering and unchanged economic mechanics.

Validation: all517 tests,248 syntax checks, dry-run and diff check pass. Only3 focused new social tests; existing quiz/runtime tests extended for real completion alerts, default-off and global-alert deduplication, auth/receipt protection and zero market/starter/scheduler work. Disposable SQLite browser at1280/390 verifies new/added/mutual states, counts, persistence and failure recovery, account list pop-up, every friends filter, settings opt-in/save, all requested profile sort columns, compact alchemy selection/confirmation, mouse/touch/keyboard drag with updated next/lucky cards and unchanged wallet/inventory. No page errors/overflow. Evidence: surrounding work/friends-* and alchemy-approved-*.

Runtime `5b2de699606228cdbd46e59f5b15c776e8866b73` is pushed/deployed on original `amqtours-gatcha`, version `aa0c6146-f398-4a5d-a954-456717af8063`. Exact-commit Verify application43837627388 and demo43837627501 CI passed. Live verification09:18–09:19Z: all15 changed/new browser assets200 and exact source bytes, health200, public profile/index show viewer-relative friendship metadata while the alert preference remains private, and six authenticated list/filter endpoints plus anonymous friend-write rejection return401. Guest browser shows the profile count/control and50 compact Players controls, with the rank filter disabled while signed out and no page errors/overflow. Default deferred backend adoption completed normally; no reset or unchanged-source redeploy. Original GAME/Game/named economy, bindings and migration configuration preserved. No production friend add/remove, settings save, quiz attempt, inventory, balance or other gameplay QA mutation. Approved alchemy preview is now implemented, superseding the older preview-only handoffs below. No remaining authorized work; ownership released. This documentation commit is newer than the deployed runtime.

## Completed — Quiz Favorites and Profile Browsing Controls

November 16. Codex owns integration/deployment on main in this checkout, base61de927. Scope: quiz persistence/API/UI and lifecycle cleanup; Song List working-title hints; owner showcase removal; shared anime-title Settings selector; wishlist sorting before pagination and demo parity; focused existing tests and shared CSS. Favorites are a per-account preference with a separate priority toggle composing with category/search/sort. Preserve pending preview-only alchemy design and all production player state. No historical operations or live QA mutations authorized by this task.

Implementation verified locally: per-account favorites are transactional/idempotent and avoid starter/market/scheduler/full-state work; unplayed quizzes can be favorited and host score resets preserve them. Identity/player reset/quiz deletion lifecycle included. Working-title hints escape imported titles. Showcase removal uses existing owner action with expected order. Settings changes sync immediately while preserving unsaved form fields. Wishlist sorts all matching cards before pagination; custom/all-card pages retain bounded SQL reads and private ownership remains hidden. All514 tests,245 syntax checks, diff check and Wrangler dry-run pass. Disposable SQLite/browser checks at1280/390px cover persistence, combined filters, injected save failure, working-title hints, owner-only removal, public/own wishlist sorting across pages, preference synchronization/reload, no overflow/page errors and unchanged wallet/inventory. Saving a manually arranged wishlist switches back to Custom Order/page1; the final two-line follow-up passed14 focused tests and both full browser scenarios again. Evidence: surrounding work/quiz-favorites-* and wishlist-sort-*.

Runtime `0b99181e7c575ae9f364311a6023b3b4268bb4cc` (feature commit79dc726 plus arrangement follow-up) is pushed/deployed on original `amqtours-gatcha`, version `734c5e14-70a9-4b41-b352-0208ce361d45`. Exact-source Verify application43832933199 and demo43832933097 CI passed. Live read-only verification at08:39–08:40Z: six changed assets byte-match source, health200, all169 quiz summaries include the new anonymous favorite state, public Song List includes working titles without audio URLs, anonymous favorite POST401, public wishlist alphabetical order verifies. Guest browser rendered168 Singer hearts, toggled Favorites First and opened a working-title Song List hint with no page errors/overflow. Backend adoption was allowed to complete normally; no object reset or unchanged-source redeploy. Final follow-up changed app.js only. Existing bindings, named objects and migration configuration unchanged. No production preference, showcase, account, quiz attempt or economy QA mutation. Alchemy remains preview-only and its live asset matches unchanged source. Ownership released; no remaining authorized work. This handoff commit is newer than deployed runtime.

## Completed — Approved Premium Quiz Titles; Alchemy Design Preview

November 16. Runtime `067bd0f3be65fd3bfbdf51ebd13abd3f450ca113` is pushed/deployed on original `amqtours-gatcha`, version `7b32ee11-251c-4bad-b4a7-32b3079a1259`. The user approved the earlier premium quiz-title design. Saved perfect scores with nonnegative integer completion times strictly below60,000ms now derive `premium` and `durationMs` presentation metadata on read, including existing records. Exactly60,000ms, slower, untimed, invalid times and non-perfect scores do not qualify. Profiles and My Titles apply the gold/opal border, soft glow and passing shimmer without rarity labels/icons; equipment, ordering, titles, awards, rewards and score data are unchanged. Reduced-motion disables both animations.

Host version84/source `b563edf390e24ecd94b61a7a6cadc06ec1142697` mirrors the approved styling and whitelists the public title metadata through its identity bridge. Public profile metadata and Host synchronization verified after ordinary deferred backend rollout; both changed Gacha assets and Host identity assets byte-match source, health200. No maintenance mode, schema migration, production quiz attempt, title equip or economy mutation was used. All511 Gacha tests,245 syntax checks and Wrangler dry-run pass; six focused Host account/identity tests and types pass. Local desktop/mobile checks cover both renderers, card-title separation, My Titles, animations and reduced motion. Private evidence: surrounding `work/premium-*` files.

Alchemy redesign is **preview-only**, outside repository/public assets: `outputs/alchemy-selection-preview.html` and `outputs/alchemy-selection-draft-1280.png` / `-390.png` in the surrounding task workspace. The interactive draft uses compact numbered thumbnail rows, full names, lucky-slot highlighting and a right-side next-card/odds/action panel; removal, reset and keyboard reordering update the sample queue/lucky slots. No alchemy application files or mechanics changed; live alchemy-ui.js matches unchanged source. Wait for explicit user approval before implementing/deploying the alchemy layout. Ownership released; this documentation commit is newer than the deployed runtime source.

## Completed — Quiz Upload Automod and Review Sorting

November 16. Runtime `b1909ba1255130f774fcffe86b6429000ff800be` is pushed/deployed on original `amqtours-gatcha`, version `dce777fb-9e88-427a-bd60-89fee65aadd2`. Upload review automatically summarizes broken/unverified MP3 links and duplicate song titles (Unicode width/case/whitespace normalized), with original row references and per-song duplicate badges. Duplicate warnings are advisory; existing link replacement/skip/save validation remains enforced. Append mode also compares retained current-pool songs, omitting selected removals and identical MP3s that save merges. Warnings refresh when skipping/restoring/removing songs or changing import mode. Saved pools expose Run Automod · Check Links, with bounded host-only scans and no player-triggered background requests. Explicit rechecks now bypass cached successes as well as failures; network target validation and limits are preserved.

Song/Artist/Anime headers sort upload and saved-pool tables ascending/descending, with natural numeric comparison, stable ties and empty metadata last. Original row/audio-action indices, selected removals, keyboard focus and table scroll persist; sorting moves existing nodes instead of replacing field controls. Async review completion retains the chosen sort. A scoped grid fix keeps wide review tables inside their scroll container on mobile. No scoring, rewards, inventory, account, schema or binding changes; premium title preview remains unapplied.

Validation: 510 tests, 245 syntax checks, Wrangler dry-run and diff checks pass. Final focused tests and real host-page local browser checks at1280/390px cover auto warnings, in-flight sorting, all columns/directions, keyboard focus, repairing the correct song after sorting, fresh recheck flags, append vs replace, current-pool scan/removal warnings and checkbox retention, with no page errors or overflow. Existing cache test verifies a formerly healthy URL is rechecked and becomes a failure when forced. Four live assets return200 and byte-match release; health200 and guest audio-check access401. Private logs/screenshots/proof remain in surrounding `work/quiz-automod-*`. Production checks were read-only; no quiz was uploaded, changed, played or deleted as a test. Ownership released; no remaining authorized work. This documentation-only commit is newer than the deployed runtime source.

## Completed — Profile Quiz Statistics and Larger Showcases

November 16. Runtime `9866cfbc510eff761051270ea34d07d78e80f09f` is pushed/deployed on original `amqtours-gatcha`, version `eeca039b-65e2-4dd7-a04c-94ec94700c59`. Own/public profiles have Quiz after Listed: unique published quizzes played, max scores, average personal best, current #1 count, average recorded best time, and a #1 list with score/time/category and leaderboard shortcuts. Existing score/time/achievement/player-ID tiebreaks are preserved; drafts, previews, removed quizzes and unfinished attempts do not count. Untimed records are excluded from the time average. The bounded stats read runs only when the Quiz profile tab opens.

Showcase capacity now allows 1,000 total slots, still 30 free and 100 credits per extra slot. The once-only transactional CHECK-constraint migration copies existing capacities exactly; it does not replay old free-slot conversions, credit corrections or purchases. Wishlist was already 1,000 and remains so. Bindings, named objects, credentials, scores/rewards and existing holdings are preserved. Adjacent Host version83 (`aa85d496e38bb7de391b88c8b245a6a9d59aa75f`) prevents exporting stale Eru snapshots; CSV/PNG use the corrected per-tier life taken/lost columns, with both-hit matchups skipped.

Validation: 509 tests, 244 syntax checks, diff checks and Wrangler dry-run passed. The existing real Workers SQLite profile test additionally verifies an old 100-slot constraint migrates and preserves capacity before a 900-slot purchase to 1,000. Desktop/mobile full-app local checks verify own/other profiles, all metrics, #1 lists/shortcuts, no unnecessary card-page request, overflow or page errors. Seven live assets byte-match release (including unchanged title-ui.js); new public stats endpoint returns200 after normal deferred rollout, invalid player404, health200. Host Eru guard asset is verified live. No production quiz attempts, purchases or test accounts were created. Private proof: surrounding `work/profile-quiz-*` files.

Premium 20/20 + strictly sub-60-second title styling remains preview-only pending user approval. Standalone gold/opal/shimmer HTML and PNG live outside the repository/public assets in surrounding `outputs/premium-quiz-title-preview.*`. Reduced-motion behavior verified. No premium title CSS, eligibility or awards were deployed. Ownership released; no required implementation work remains. This documentation commit is newer than the deployed runtime source.

## Completed — Quiz Song List Column Sorting

November 16. Codex owns `public/quiz-ui.js`, scoped styles in `public/features.css`, existing quiz UI test coverage and this handoff. Base beb8331; remote main is aligned. Public Song List and Songs Played recap have ascending/descending column buttons, arrows and aria-sort state. Sorting preserves original row numbers, stable ties, cached pool/recap data and the selected anime-title preference; missing metadata/times stay last. Sort values are prepared once per row. Keyboard focus remains on the activated header. No backend or quiz/account/economy writes.

Validation: all 26 existing quiz UI tests pass, including expanded pool/recap sort coverage; 243 JavaScript syntax checks and Wrangler dry-run pass. Disposable browser QA at 1280px/390px verified numeric song ordering, stable ties/original row numbers, all pool columns, missing artist last in both directions, Enter activation/focus, no page overflow and no browser errors. Evidence in surrounding `work/quiz-song-sort-browser-proof.json` and screenshots.

Runtime f08d167 is pushed/deployed on original amqtours-gatcha, version 55955cf5-dc1a-4dec-976f-161754af0d50. Both changed assets return 200 with exact release bytes at amqtours.app/gacha; health is 200. No production quiz attempts or data mutations; bindings, named objects and migrations are unchanged. Live proof: `work/quiz-song-sort-live-proof.json`. Ownership released; no remaining authorized work. This documentation-only commit is newer than the deployed runtime commit.

## Completed — Live Auction Updates and User Bid Increments

November 16. Auction work started on f4b0f83; separate navigation commit 17534f5 arrived in the shared checkout and is preserved unchanged. User auctions now require 10% higher bids rounded up to whole credits after the opening reserve. Existing server-side seller bid/buyout rejection is retained and explicitly tested, including a bid that would trigger buyout; the browser rejects attempts to open an own-auction bid form too. Opening reserves, fixed buyouts, holds/refunds, auction durations and anti-sniping behavior are preserved. No migration or historical auction reset.

Optional bounded snapshots on authenticated notices reads return the viewer's current balance and up to 64 requested auction lots. Polling uses five seconds on visible Auctions/open bid forms and the existing 30-second cadence elsewhere; hidden tabs, busy actions and active quizzes pause. Live lot/refund updates redraw only when changed; current bid forms patch minimum/available credits in place, preserve custom amounts, and reject stale/account-mismatched responses. A fresh read precedes opening a bid form. No repeated full-state download is used for outbid detection.

Validation: all 508 tests passed. The existing Worker runtime test additionally verified snapshot authentication, payload and invalid-ID rejection. Local desktop/mobile browser QA at 1280px/390px verified 100 → 110 → 121 bidding, another 134 bid updating the open form minimum to 148 while preserving a typed 500, refunded balances, successful re-bids, no manual reload/full-state fetch on outbid, and no page errors/overflow. All 243 source/test syntax checks, diff checks and Wrangler dry-run passed. Evidence: surrounding work/auction-live-tests.log, auction-live-runtime.log, auction-live-browser-proof.json and auction-live-form-*.png. Production checks remained read-only.

Runtime a9dd32f4644323414e264c9ae7ebd37c0494d433 is pushed/deployed to original amqtours-gatcha, version fe2ffaf8-fc77-4279-91bc-ffacf81cbc51. All four changed browser assets returned 200 with exact release bytes on amqtours.app/gacha; health is 200 and guest auction-snapshot access is 401. Existing GAME/Quiz bindings, named objects and migration history are unchanged. No production bids, account/test mutations or resets. Private live proof: work/auction-live-release-proof.json. Ownership released; no remaining authorized work. This documentation-only commit is newer than the deployed runtime commit.

## Completed — Wishlist Controls Across Card Browsing

November 16. Codex on main, base 1aba653. Added the shared wishlist toggle to player marketplace, Flash/weekly shop, Sell Cards, Your Listings, trade listings and offered cards, profile showcases, Recent Collection and Listed cards. Buttons use the viewer's saved wishlist, retain Collection-before-Wishlist order, and do not depend on affordability or ownership. Profile owner status icons remain the owner's flags. New signed-in controls stay out of card-selection pickers; existing wishlist/API authorization behavior is preserved. No backend, economy, schema or binding changes.

Validation: 30 focused existing tests passed (shop, trades, showcase, wishlist, settings/UX), expanded for selected state, guest behavior, profile listings and picker isolation. Modified browser modules passed syntax checks; diff checks and Wrangler dry-run passed. Disposable local SQLite/browser QA at 1280px and 390px verified marketplace add/remove, server-error handling, wishlist heart refresh, Sell/Your Listings, trade listing/offer controls, showcase saving and Recent Collection controls; no page errors or page overflow, and inventory/balance were unchanged. Private evidence/scripts: work/wishlist-access-browser-proof.json, work/wishlist-access-browser.mjs and work/wishlist-access-*.png. No production wishlist edits or test accounts.

Runtime f1828f21f2d1fc83db678d2cda78fd788a7fa29d is pushed/deployed on original amqtours-gatcha, version c28b88ea-3f5a-4cfe-84d5-74c84b430dd0. All five changed assets return 200 and match release bytes at amqtours.app/gacha; health returns 200. Bindings, named objects and migrations remain unchanged. Ownership released; no remaining authorized work. This documentation-only commit is newer than the deployed runtime commit.

## Completed — Quiz Anime Display Preference

November 16. Codex on main, base fba6edd. Public Song List, answer reveal and Songs Played recap resolve imported anime aliases to AMQ's labelled English/Romaji main names using the existing site preference. Preference changes render immediately, including cached song lists and reveals. Existing pools need no reimport; submitted text, accepted answers, scoring, rewards and saved data are unchanged. A static 509,657-byte anime-only index is loaded once on entering Quiz, alongside the list request; no per-song API or answer-key metadata is added. Missing translations use the other main name, unknown/ambiguous aliases retain the source label. The bundled-master refresh tool rebuilds the index too.

Validation: 34 focused quiz tests passed; 242 source/test syntax checks and Wrangler dry-run passed; diff checks clean. Disposable local Worker/browser QA at 1280px and 390px verified mixed English/Romaji source labels become consistent in both modes, switching preferences, correct grading with original submitted text preserved, no repeated title downloads, no page errors or page overflow. Private screenshots/scripts are in surrounding work/quiz-title* and work/quiz-titles*. No production quiz attempt or data mutation was made.

Runtime e0128d0ecfdf4ecd1f59ba33cfe503612bffd370 is pushed and deployed to original amqtours-gatcha, version e29cf7b2-26b9-49bb-8300-3caaa5e58ad7. Bindings, named objects, migrations and Worker runtime code are unchanged. Four changed assets return 200 and match local bytes at amqtours.app/gacha; health is 200. Read-only live browser verification of Hatano, Wataru's actual 33-song list confirmed both screenshot songs display Haiyore! Nyaruko-san W in Romaji mode and Nyaruko: Crawling with Love! W in English mode, with no page errors. Private evidence: work/quiz-title-live-proof.json and work/quiz-titles-live-*.png. Ownership released; no remaining authorized work. This documentation-only commit is newer than the deployed runtime commit.

## Completed — Team Reward Review and Faster Credit Search

November 16. Runtime 15a41bb19d4fcbf4a96d4a99010405e7ac44dc58 is pushed/live on original amqtours-gatcha Worker version 97ce1c36-9067-401c-95e5-cbb15f784cc0. Existing GAME/Quiz bindings, named objects and migration history are unchanged. Upstream Delete Quiz/auction work 6f2abce was integrated before validation/deployment; preserve it when making later releases.

Participation review preserves team-result line/order with four-player desktop rows and responsive wrapping. Subs stay under their outgoing player; flat signup lists retain pasted order in groups of four, and outside staff have a separate group. Participant search includes names/IDs/aliases and hides no-match groups without resetting rounds/checkboxes or removing anyone from the payout. Credit Multiplier defaults to 1×, accepts 0.1×–10× in tenths and scales participation AND Count/Report/outside staff as explicitly requested. Server-authoritative whole-credit math, audit multiplier, v3 review guard, duplicate-tour and retry protections remain. No past awards are recalculated.

Manual grant/deduction search reuses normalized registry indexes, limits displayed options to 100 while searching every identity, preserves matching selected recipients, and avoids identical dropdown rebuilds; no per-keystroke requests/debounce/caret replacement. Local browser benchmark with 601 players/6,002 aliases: median update 7.4 ms before vs 0.3 ms after (local measurement, not a production latency guarantee).

504 full tests, 239 syntax checks, dry run, both GitHub checks and 1440/390px real isolated Worker/browser tests pass. Browser checks cover team order, retained form state, subs/staff, exact 2× payout, invalid multiplier, old-client rejection, paid-once retries, native dropdown search/caret and no overflow. All six live assets byte-match. After the normal deferred actor rollout, the read-only owner preview returns the new canonical team metadata. Private logs, screenshots, benchmark and release proof are in work/reward-controls-*. No production reward batches or test accounts were created. Release ownership is released; the isolated worktree can be archived. Shared checkout remains on its own commit; integrate origin/main before its next deployment. This documentation commit is newer than the deployed runtime SHA. No remaining authorized work.

## Completed — bop XP, Historical Compensation and Missing-Target Warnings

November 15. Runtime 460fbf3eb66cb012b3728cdba99027137558622a is pushed/live on the original amqtours-gatcha Worker version a8e7d67f-e0c1-4bf3-b7f8-0e199acdbf29, with the original GAME/Quiz bindings and migrations preserved. Both draw buttons warn when no saved target exists, including with empty balances. Normal XP draws can review/confirm an affordable random draw; bop cannot submit without a target and offers Choose Target. The lowercase bop confirmation and 10% target-miss rebates/guaranteed redemptions are live.

Owner-authorized historical compensation bop-target-miss-backfill-2026-11-15-v1 was applied ONCE: 337,310 bop XP for 2,811 retained target misses across 122 players. Every player reconciled to an independent indexed, read-only SQL audit before application. Reset/reverted history was excluded; the saved receipt and post-application balances/versions reconcile, including nine live refinement steps during verification. Normal XP, credits and inventory were not changed by compensation. The durable receipt makes subsequent requests read back the original result. Do not replay this or the older normal XP compensation. Private evidence/CSV and PITR bookmark remain outside Git under the shared work directory.

502 full tests, 239 syntax checks, isolated real Worker auth/backfill/retry tests, dry run, and 1440/390px browser checks pass. GitHub Verify application and demo checks passed for the runtime SHA. All four changed live assets byte-match; the live owner preview/apply/receipt succeeded after the normal deferred Durable Object update window. Runtime source commit is distinct from this newer documentation handoff. No production test accounts/draws were created.

Deployment ownership is released. Preserve the separate session's uncommitted Delete Quiz work in the original shared checkout; integrate current main before deploying that work. This isolated bop checkout may be archived after the handoff; the shared checkout was not pulled, switched, stashed or reset.

## Completed — Quiz Focus Recovery

November 15. Runtime 6929d1b63406c7a6d31ee0ff757e10dd97cdd899 is pushed/live on the original amqtours-gatcha Worker version 5ab6ad3c-d18b-48f0-a738-0fd48dee25f1. The existing foreground quiz clock now also recovers same-node focus loss when focus falls to the page (including temporarily disabled inputs after submission errors). It respects explicit Tab/Shift-Tab navigation, other focused controls, open account/song dialogs, hidden documents and inactive windows; returning focus to the answer input or starting a new song resets the navigation pause. Explicit audio recovery returns focus to answering. No new timers/listeners/polling, backend changes or quiz timing/reward changes.

The existing focus test failed before the fix and now passes. All 26 focused UI tests, syntax/diff checks and dry run pass. Real-browser checks at 1280/390px verify native blur recovery, preserved answer/caret, an injected rejected submission and retry on the same input, Tab/other-control respect, modal plus background-field redraw, first/next-song focus, a 2-second delayed Next acknowledgment, and refresh resume without script errors/overflow. Hidden-tab/inactive-window gates are covered deterministically in the UI test; headless Chrome does not reliably model native tab/window focus. Live quiz-ui.js byte-matches the release. Private logs/harness/proof are in work/quiz-focus-recovery-*. No production quiz attempts or data corrections; shared Delete Quiz edits remain untouched. Merge origin/main before publishing them.

## Completed — Quiz Answer Autofocus

November 15. Runtime 1c29aa2e7159bdc80fc476f8cacaa6057ff245a3 is pushed/live on the original amqtours-gatcha Worker version 7b143602-9f2a-4f8e-92b0-12a9b7d71a9d. Autofocus tracks the actual answer input node instead of a per-song boolean, and records focus only after the browser accepts it. Replaced fields regain focus; failed mount-time focus retries; intentional focus on another control is not repeatedly stolen. No backend/timing/reward changes.

The existing regression test failed before the fix and now passes. All 26 focused quiz UI tests, syntax/diff checks, dry run and real-browser QA at 1280/390px pass. Browser assertions check focus before fill on the first song and the next song, after a full in-song redraw through Anime Titles, and after a two-second delayed Next acknowledgment; typing/focus and refresh resume survive, without script errors or overflow. The live quiz-ui.js byte-matches the release. Private proof/logs/harness remain in work/quiz-autofocus-*. No production quiz attempts or data corrections. Original shared Delete Quiz edits remain preserved; merge origin/main before publishing them.

## Completed — Competitive Quiz Fast Sessions

November 15. Runtime 533a6fd59a7f2dccff01d3dbeacd29a49bc89ee7 is pushed to origin/main and deployed on the original amqtours-gatcha Worker version 7812a076-6ec2-4e5e-8b9c-56d83df8380f. New Competitive runs preload audio and use per-run SQLite QuizSession actors; the original economy/Game and QuizLibrary remain intact. Preserve QUIZ_SESSIONS / QuizSession and additive migration v3-quiz-sessions when integrating other work. Shared question-state extraction preserves legacy deadlines and guards competitive runs against the old endpoints.

Game retains setup/resume/stop/restart and final transactional awards. Session ready/answer/Next/read avoids shared-engine activity, authenticates cookie-bound HMAC tickets before actor lookup, durably locks answers, and never accepts client scores/timestamps. Buffered Next starts locally while acknowledgment is pending, preserving the typed input/focus; failures reconcile or roll back for a stable-key retry. Reveals still require one small online acknowledgment: no offline/decryptable answer key was shipped. Competitive completion timing starts at the first authorized song, excluding initial preload/countdown; historical scores/rewards are unchanged. Pool/list download ordering is independent. Logout/access-reset/lock revokes actor access; stop/restart invalidates the old actor.

494 tests, 238 syntax checks, real isolated Worker auth/timing/retry/settlement checks, final dry run and both runtime-commit GitHub jobs pass. Browser QA at 1280/390px with real MP3 playback and a deliberately delayed 2-second Next acknowledgment measured 17/16ms to the usable next question, preserved typing/focus, resumed after reload, and had no script errors or horizontal overflow. These are local measurements, not production latency guarantees. All 20 question moves made zero shared-engine calls in the runtime proof. Live app.js and quiz-ui.js byte-match the release; health is 200, unsigned/forged session access is 401. No production quiz attempts, test accounts or reward/data corrections were made. Private logs, browser harness/screenshots and live proof remain in the original workspace's work directory. No required work remains.

## Completed — Quiz Timing and Pick’em Timers

November 15. Isolated runtime source `9aac2ecb7413c2b17e49731ea2b26448fd8892a7` (includes `575ea98`) is pushed to main and deployed on original Worker version `b56a109e-9f01-4137-b3a5-9ac1432c238a`. The original shared checkout has separate uncommitted Delete Quiz work, preserved and excluded from this release. Its integration notice requires merging main before deployment. The temporary timing worktree is being archived after handoff; source/evidence remain recoverable.

Reproduced a delayed-response timer showing 19s when the server had 16s. The quiz now uses monotonic time and the lowest-latency clock sample, stamps complete answer bodies at the Worker with client headers overwritten, judges arrival instead of database processing, and returns fresh server timestamps for cached receipt replays. Server-authoritative 20-second questions and existing one-second arrival grace remain. Arrival/processing metadata support diagnostics; historical scores/rewards were not changed.

Host Pick’em editors offer Extend Time and Close while open, and editable Reopen (five-minute default) when closed. Extensions add to the existing deadline, reopening starts from now, picks/rewards stay intact, and paid results remain protected. Timer-only changes tolerate newly submitted votes; stale settings and duplicate retries are guarded. The active editor stays open/refreshed after each action, including mobile wrapping.

493 tests, 236 JS syntax checks, Wrangler dry run and both GitHub jobs pass for the final source. Real isolated Worker tests cover queued on-time answers, forged timestamps, bounded complete-body stamping, receipt retries with fresh clocks, and unchanged rewards. 1280/390px host end-to-end checks cover extend/close/reopen, preserved votes and refreshed editor. All five changed live UI assets match source; health and unauthenticated host-action rejection checks pass. Natural production traffic produced 13 arrival-stamped answers after the first runtime rollout. Final retry-clock behavior was verified in the isolated Worker; normal deferred backend propagation was allowed. Private logs, red/green timing repro and release evidence stay outside Git. No production test mutations or historical corrections. No remaining authorized work.

## Completed — Owner-Authorized AKINO Quiz Removal

November 15. Exact AKINO quiz removal and full issued-credit recovery completed once under durable receipt `host:quiz-retirement / akino-removal-2026-11-15-v1`. NEVER replay it. Runtime `b36fee4858691b900dc53767fa96ef274b865614` is pushed/live on original Worker version `ab70ccd0-51d6-4f8e-aa56-e91da25744b0`. User explicitly authorized negative wallets. A final payout during deployment was caught by stale-source guards before mutation; quiz was unpublished with an idempotent host-save receipt, final source ledger re-reconciled to completion receipts, then removal applied atomically.

126,700 credits recovered from 59 players across 82 original payments; lifetime earned reduced by the same amounts. 36 balances became negative at application. Removed quiz pool/answers, scores, active runs, reward history, completion-title preferences and quiz-title ordering. Arai, Akino and Makino, Yui retain their original pools. Original award ledger entries and receipts remain as evidence; new reversal entries record every deduction. Signed-wallet table migration preserved every account column/value/index within the transaction, and a PITR bookmark is saved privately. Ordinary spending remains bounded by available funds; incoming earnings/refunds reduce negative balances normally.

489 tests, 235 JS syntax checks, real isolated Worker owner/auth/migration checks, failure rollback/retry proofs, Wrangler dry run and both GitHub jobs passed. Negative-wallet pack UI checked at 1280/390px; live app asset matches. Live verification reconciled each debit, wallet and earned result (including two subsequent legitimate awards), removal/public listing, original award history, preserved indexes and other quizzes. Receipt confirmed without reapplying. Private before/intent/result/after, proof, report and per-player CSV remain outside Git. No other accounts, inventory or historical recoveries were reset. No remaining authorized work.

## Completed — Compact Trade Filters

November 15. Runtime `18dd773` pushed/deployed to original Worker version `88cb22f7-ecb7-4317-8aeb-d300b2da45e1`. Trade browsing uses aligned 42px type/search/rarity/sort controls, compact 160px dropdowns, expanding search, and collection-style checkbox chips with matching selected highlights. Narrow screens wrap with paired dropdowns and consistent gaps. Fifteen focused existing tests, JS syntax/diff checks and Wrangler dry run passed; browser QA at 1440/1280/800/390px checked all three card types with character-role and completed filters, equal control heights and no overflow. Desktop All Cards toolbar fits one row. Both changed live assets match source. No backend changes or production mutations; no remaining work.

## Completed — Pack Result Collection Access

November 15. Runtime `7076503` pushed/deployed to original Worker version `d62c7827-2f2f-4876-9641-eefd7c8619d0`. Pack card actions now restore each button's previous disabled state in finally before syncing ownership-specific actions; Collection remains usable after successful or failed Protect/Showcase updates. Quantity hint shortened to “5 cards per pack.” while retaining the affordable quantity cap. Eleven focused existing tests, app syntax, diff checks and Wrangler dry run passed. Local 1280/390px end-to-end browser checks open a pack, perform successful and failed Protect updates, then open Collection; concise copy and affordability cap verified. Live app.js byte-matches release. No backend/economy changes, production test mutations or remaining work.

## Completed — Stable Wishlist Header

November 15. Runtime source `fff9d9d` pushed and deployed to original Worker version `4ad9239e-7e06-41b1-9120-59dd3ad438fe`. Wishlist uses an explicit three-column header with fixed toggle placement and a separate right-aligned Arrange action; narrow screens use a fixed heading/action row with the toggle underneath. All Cards/Characters/Seiyuus have identical toggle coordinates and header heights when Arrange disappears. Checked at 1280/1024/800/720/390px, with no overflow or overlap. 16 focused existing tests, JS syntax, diff checks and Wrangler dry run passed; both changed live assets byte-match source. No backend/economy changes or production test mutations. No remaining work.

## Completed — Gemini Settings Patch and Review Fixes

November 15. User authorized integration of Gemini's patch with all five review findings fixed; custom Next Song was omitted, retaining fixed Enter. Runtime source `516960172413bdd531005b62047c24383d2f2cc4` is pushed to main and deployed on original Worker `amqtours-gatcha`, version `7da7e86f-56ec-408c-aa1a-d19755dbd482`. No proxy deployment, production test mutations or historical account/data corrections.

Private collection ownership is hidden in wishlist protection flags and pinned anime progress (including implicit progress ordering); owner access remains. Unrated auto-sell cards are retained. Trade completion is informational with zero synthetic wallet delta. Recent history uses indexed seller/proposer branches limited before merging, with batched bundles and card names. Six other customizable quiz shortcuts and all other Gemini features were preserved. Mobile Settings width/checkbox wrapping corrected during visual QA.

Validation: 486/486 tests, 233 JS syntax checks, Wrangler dry run, migration/restart + auto-sell retry/late-failure rollback, indexed EXPLAIN plans with no temporary sort, and 1280/390px local browser QA passed. GitHub Verify and demo jobs succeeded for source SHA. Seven production assets byte-match source; live page loads without script errors. After Cloudflare's normal deferred database rollout, public profiles at both domain and play-proxy APIs expose the six new shortcut defaults without Next, and health/state reads succeed. Private original patch, test evidence, screenshots and release report remain outside Git. This newer documentation commit records release evidence; deployed runtime source is the SHA above. No remaining authorized work.

## Pre-Deploy Review — Gemini Settings and UX Patch

November 15. Codex reviewed the uncommitted patch against `65b3599`, including both new untracked modules. Application source untouched; nothing deployed. Five findings need follow-up: private-collection ownership leaks via wishlist/pinned progress; unrated auto-sell; duplicate completed-trade debit display; global completed-history scan on state refresh; custom Next hotkey focus suppression. Detailed reviewer handoff and disposable repro harnesses are outside Git. Existing 486 tests and 232 syntax checks passed, as did additional legacy-migration/restart and auto-sell retry/rollback probes. The user requested review, not implementation; Gemini/Antigravity retains implementation ownership.

## Owner-Authorized Access Follow-up

November 14. The owner subsequently authorized unlocking the corrected beneficiary account. Existing owner-only account-lock API applied the unlock with an idempotent receipt. Live flag, registered access and retained card/XP/title corrections were verified. No credentials, recovered assets, balances or previous corrections were restored; no runtime changes or deployment. Private before/intent/result/after evidence stays outside Git.

## Completed — Funding-Based Upgrade Recovery

November 14. Owner authorized chronological funding reconstruction and the previewed supported-copy downgrades. Runtime source `18f6abd` is pushed and live on original Worker version `d06823da-8dd7-4879-a8f8-bc7c6d948157`. Sealed owner-only correction committed once under `funding-upgrade-recovery-2026-11-14-v1`, with a PITR bookmark and stale account/card/title/upgrade/prior-settlement guards. It is complete: NEVER repeat it. Private reconstruction, exact manifest, previews, before/after, local proof, applied/verified receipt and owner report remain outside Git.

Historical reconstruction reconciled original inventory, cash and XP, including escrow, receipt-linked cash operations and recorded outcomes. Prior cash/XP recovery was credited before deriving supplementary copy losses. Live verification confirms reviewed levels/spares, affected MAX award/order and legitimate upgrade investment; wallet, XP, lock, prior receipt, unrelated inventory, quiz records, avatar and showcase are unchanged. No previous reset/recovery was repeated, no hypothetical balance or cards granted, and no cash valuation of recovered copies claimed.

479 tests, 230 syntax checks, Wrangler dry run and exact-snapshot correction proof passed. Existing runtime tests cover owner/seal rejection; behavioral tests cover stale/altered evidence, late-failure rollback, spare-copy retention, title isolation and retry safety. Live durable receipt and health verified. This later documentation commit records application evidence; deployed runtime source is the commit above. No remaining authorized work.

## Completed — Authorized Targeted Recovery

November 14. Owner approved the prepared conservative recovery. Runtime source `15818e9` is pushed and deployed to the original Worker version `f1d409ff-c3ee-427b-93af-17f9e9559620`. The owner-only rollback route accepts only the exact sealed manifest, rechecks locked-account/inventory/wallet/XP/upgrade guards, and commits all changes with a PITR bookmark and one receipt under `targeted-benefit-recovery-2026-11-14-v1`. It is complete: NEVER repeat it. Private manifest, preview, before/after, applied/verified receipt, exact-snapshot local proof and owner report remain outside Git. All affected rows and preserved inventory, quiz progress, titles, profile fields and account lock were verified live. The report explicitly records unrecovered mixed proceeds; no negative wallet or automatic future collection was added.

477 tests, 229 syntax checks and Wrangler dry run passed, including stale-snapshot rejection, late-failure atomic rollback, retry safety and real Worker owner/seal rejection. Original economy identity, other players and earlier account resets remain untouched; live health OK. This later documentation commit records application evidence; runtime source is the commit above. No remaining authorized work.

## Completed — Account Correction Follow-up

November 14. Five explicitly authorized gameplay/access resets are complete and live-verified: baseline balance/earned 5,000, inventory and quiz progress cleared, sessions/credentials/recovery invites revoked, identities retained, consumed special packs preserved. Temporary locks were released after verification. Do not repeat these operations or the earlier six completed resets. The later owner-approved targeted recovery above resolves the prior pending decision. Private evidence remains outside Git.

## Flash Shop Schedule and Discounts

November 14. Runtime source `2a797ef` is pushed and deployed to the original `amqtours-gatcha` Worker, version `b5f8b12b-f24c-4f31-a10e-0e4fbee528eb`. Flash Shop alternates three hours open / three hours closed using a persistent cycle anchor, including restarts and missed windows. New stock receives a stored whole-percent discount from 0 to 50, weighted by `51 - discount`, with crossed-out original prices and badges. Existing open stock retains its listed prices. Purchase receipts and stored server prices remain authoritative.

All 475 tests passed; syntax check covered 228 JS files; Wrangler dry run passed. Actual shop-renderer fixtures passed at 1280/390px for sale/normal prices and closed-window countdown. Live asset bytes match local files, health is OK, and the public shop renders the new schedule. After the default deferred Durable Object rollout, public state verified `flashNext - flashEnds = 3 hours` during the existing opening and discount fields on all ten preserved stock rows. No production purchases or test accounts were created. Original economy bindings and named instance remain unchanged. This later documentation commit records deployment evidence; runtime source is the commit above. No remaining task work.

## Pick’em Share Placement

November 13. Source `e9314ab` is live on Worker version `47faac3e-5107-4bfe-b323-11aeac1602a8`. Copy Link is at the bottom right of the featured ticket and pick’em cards. The list expands and collapses teams in place. Multi-match boards share individual matches. All 24 focused tests passed. Verified clipboard, expansion, collapse and direct links on the live site at 1280 and 390 pixels.

## Homepage Pick’em Ticket

November 13. The approved preview is deployed at `/gacha/` in source commit `756e730`, Worker version `5a5de384-65ee-492c-885b-27ee57cb4865`. All three live assets matched the release. The open-state browser fixture passed at 1320, 390 and 320 pixels, including the running clock and prediction link. There was no active production Pick’em at verification. All 21 focused tests, syntax checks and the dry-run build passed.

## Pick’em Links and Gacha Navigation

November 13. Codex updated the player router, Pick’em board and host publication link. The public path is `/gacha/pickems/<pickem ID>`. Bookmarked fragment routes remain supported. No schema or economy changes. Commit `8bbaf9b` was pushed and deployed to the original Worker, version `fcb4cce8-1c9a-44e4-a8a0-cb1da0317f71`. All 473 tests passed. Production desktop and mobile browser checks opened pick’em 114 directly. Copy Link, refresh, history navigation, legacy bookmarks and the missing-ID state were verified.

## Domain Routing

The play proxy deployment `a4548b51-c01d-4ed2-8988-1530146c2054` serves `amqtours.app/gacha/` through the original GAME_SITE service binding. Read-only live checks covered the player page, assets, account endpoint and host console. Three proxy tests passed. The Host Platform serves `amqtours.app/tour` from Sites version 36 (`91b10e03`), with its existing sign-in gate. The custom hostname and TLS are active. Verified the built host entry and navigation locally; all 95 host tests passed.

## Completed Task — Firefox Quiz Audio Reliability

- Codex owns `public/quiz-ui.js`, `public/quiz-audio-cache.js` as needed, focused quiz UI/cache tests and quiz/collaboration documentation. Investigating mobile Firefox failures reported after next-song preloading, affecting both normal and competitive runs. Preserve deadlines, answer/reward authority, session cache behavior and current production data. No production quiz attempts or rewards; local fixtures only.
- Base `6dae674`, clean and synchronized with main. No other uncommitted work at start.
- Implemented explicit listener/source/decoder release, current future-data readiness checks, one fresh direct-source recovery per song, proper autoplay-error classification, fresh Retry Audio and MP3 blob MIME normalization. Existing server deadlines, quick next-song path, rewards and competitive session caching retained. Answer-lock errors cannot replay sound while saving.
- Automated validation: 80 quiz tests pass (26 focused UI/cache), 222 syntax checks, dry-run build and diff checks. Two new regression cases fail against the previous UI. Existing fixtures now support real multiple-listener removal instead of silently overwriting handlers.
- Browser limitation: native Firefox automation was blocked by this environment's unsupported URL-policy enforcement. Stopped Computer Use; no browser/audio success is claimed and no production quiz attempt was created. A disposable local MP3/harness exists privately under work/ for manual follow-up.
- Runtime source **3e5aafeba220e2a13f4ba483c4fa45bf7af18155**, pushed/deployed to original Worker **36f97859-7a9b-471a-be50-c29e84e2a135**. Exact-source application and demo CI passed; both changed public modules are byte-identical live and health is 200. Local QA server stopped. Original Game/amqtours-economy-v1, all player activity and catalogue/import checkpoints retained. No pending implementation work; exact Firefox/mobile playback still requires device verification.

## Completed Task — Align Header Preferences

- Codex owns the focused header CSS change in public/card-surface.css. Card Size and Anime Titles dropdowns share a 32px height and zero margins; this removes the general form-label select margin that displaced Anime Titles. Responsive label hiding and existing preferences retained; no backend or data changes.
- Local browser checks passed: desktop dropdown tops both 24.5px/heights 32px, label tops both 33px; at 390px width dropdown tops both 16px/heights 32px with no page overflow. Syntax and dry-run build checked; no new tests for this CSS-only spacing fix.
- Runtime source **edd47d1dfc4ebb8e58fe721a6e90f3dd6de59f9d**, pushed/deployed to original Worker **fc91e752-cf76-4db8-8d39-6a857d9f9c70**. Exact-source application/demo CI passed; live stylesheet is byte-identical and browser confirmed both dropdowns/labels align at desktop width. Screenshot/evidence saved privately in work/. No pending work.

## Completed Task — Pick’em Rewards by Tour Size

- Runtime source **0b31a637ede3271648b4f85e97b1b587874f23ce**, pushed/deployed to original Worker **fd07c39d-034b-458b-b1cb-a48c0a880e86**. All 471 tests, 222 syntax checks, dry-run build, diff checks and exact-source application/demo CI passed. Existing tests cover 2–64 teams, partial groups, explicit zero/custom overrides, form recalculation and manual override preservation, and omitted edit rewards retaining the saved amount. All three changed public assets match release source; live health 200. Creation/settlement mutations verified locally, with no production pick’ems/votes/rewards created or changed. No pending work.
- Codex owns the shared default helper, tour-winner creation form and handler, server creation fallback, existing pick’em tests and documentation. Default correct-winner reward: 500 per eight players, assuming four players per submitted team; 8/16/24/32 players yields 500/1,000/1,500/2,000. Preserve host overrides and all existing pick’em rewards; no data migration or production test votes/settlements.

## Completed Task — Tradeable Filter Without Automatic Labels

- Runtime source **c673114bfca8b3b2f5fef304802c5dc66b858667**, pushed/deployed to original Worker **df9bfb4d-fba2-44eb-a5bd-327b6003f68e**. All 471 tests, 222 syntax checks, dry-run build, diff checks and exact-source application/demo CI passed. All six checked public assets match source; health 200.
- Live repair revision 2 verified: 888 manual labels restored across 38,247 inventory rows, zero mismatches against retained manual actions/current inventory lifetimes. Public Tradeable collection returned unprotected, unmarked cards correctly (21 on the first 24-card page). Existing locked account state/assets/balances and all previous correction receipts retained. No financial or gameplay reset, no production test transactions. Private before/after/release evidence stays in work/. Never reset this revision or replay the repair. No pending work.
- User clarified that unprotected cards should be included by the Tradeable Only checkbox, not automatically assigned a Trade marker. Codex owns the correction: separate filter eligibility from manual labels; stop acquisition/protection/account-unlock auto-labeling; repair only the accidental automatic labels using retained manual Trade receipts and current inventory acquisition times. Preserve manual labels, account locks, assets, wallet state, all prior repairs and the new Shop Owned/Wanted button. Prior automatic-default behavior below is superseded.

## Superseded Task — Automatic Tradeable Defaults

- Codex owns trade defaults, card protection/trade markers, acquisition paths, related UI/demo behavior and focused existing tests. User requests unlocked cards automatically included as tradeable. Existing/new unprotected cards default on; protection clears the marker, unprotection restores it, manual opt-out remains available. Locked accounts stay unavailable. Apply a guarded one-time marker backfill only; preserve card units/levels/protection/order, account locks, wallets, catalogue/imports and all completed correction receipts.
- Also added the shared Collection / Owned-Wanted button to Shop Sell tiles alongside Sell Now and List for Sale, reusing the existing counts/modal handler. Protection updates Trade controls/icons immediately and prevents marking protected cards for trade. Demo matches the defaults. 471 tests, 222 syntax checks and dry-run build pass; migration regression verifies unchanged assets/wallets, locked-account exclusion, future acquisition defaults and persistent opt-outs.
- Runtime source **227530d1632974424af9cf3ad4b68a4b7b0f1c4f**, pushed/deployed to original Worker **17abfe2c-dc1a-4865-a639-3e0b08ed75b1**. Exact-source application/demo CI passed. Read-only live checks: migration revision 1; all 30,175 eligible cards marked at verification, zero protected/locked cards advertised; existing locked account balance/assets/lock and prior repair receipts retained. Changed assets exactly match source; health 200. Browser demo verified sell-tile buttons/counts and generated Owned/Wanted panel content; IAB dismissed the overlay immediately, so persistent overlay visibility was not confirmed there. No production cards, wallets, trades or access were reset. No pending implementation work; do not rerun the completed repairs or reset the defaults revision.

## Completed Task — Host-Issued Registration Codes and Persistent Account Lock

- All new registrations require an individual one-use host-issued code, using the existing seven-day password-recovery mechanism. Players & Access → New Account Codes issues codes; supplied codes remain tied to the player and consumed once. Shared beta/code-free signup is rejected, including during mixed-version actor deployments.
- Owner-only persistent locks block registration/login, player mutations, and credit rewards; bulk reward settlements continue for other players. Locking closes open sale/trade/auction listings and returns held cards/bids, preserving investment and legitimate balances. Unlocking does not restore revoked access. The user-authorized lock was applied and verified once under `lelpop-persistent-lock-2026-11-12-v1`; **do not repeat it or its prior access reset.** Both open trade listings closed, two unrelated offers were returned, and every invested card unit plus unrelated wallets was verified. Private before/result/after/verified evidence stays outside Git.
- Runtime source **079d7fc474172cc35869048da2c94368b766acb6**, pushed and deployed to original Worker **ddb3d9e6-cf94-4214-be2e-8260876bb736**. 470 tests, 221 syntax checks, dry-run build and exact-source application/demo CI passed. Live health 200; front/actor policies both require individual one-use codes; missing-code signup 401; locked-account signup 403; anonymous lock endpoint 401; changed public assets exactly match release source. No production test accounts, grants, bets or trades. Original object, catalogue/import progress and all earlier repair receipts retained. No pending work.

## Completed Task — Authorized Three-Account Transaction Rollback

- Codex owns the scoped rollback module, Worker routes, tests and this entry. User authorized reversing all transactions/credit transfers and account access for the three newly identified accounts, following the bop scope. Freeze access before the full dependency audit; preserve unrelated activity and all previous repair receipts. Private evidence stays outside Git. Do not replay bop or historical corrections.
- Correction completed atomically once under `specialpack-three-account-rollback-2026-11-12-v1`, with the user-approved counterparty-value recovery. **NEVER repeat it.** Live receipt and every affected card, wallet, trade, sale, bonus marker, baseline reset and retained alias were verified. Three accounts have 5,000 balance/earned, no inventory/sessions/credentials/recovery invites, and consumed bonus markers. Three trades and four sales reversed; two tainted escrow listings closed and an unrelated held offer returned. Uninvolved onward trade/activity and prior bop receipt preserved. Runtime source `4a06c4b5fc3c8388b1c52b5c87ca64c01608f611`, original Worker **b5a48592-0c60-4b4b-bb88-ee7e3b8d6ffd**. 469 tests / 218 syntax checks, dry-run/fresh-snapshot proof and exact-source CI passed. Case evidence stays outside Git; only a sealed scope fingerprint is in source. Read saved verified-receipt/after evidence before any future related work.

## Completed Task — Authorized bop Rollback and Special-Pack Transfer Audit

- Codex owns a focused owner-only rollback helper, `src/worker.js` routing, its tests, and this entry. Read-only private evidence stays in ignored local work files. Preserve all unrelated player activity, source catalogue/import progress, and historical repairs.
- User authorized resetting bop's gameplay, account access and all transactions, plus checking other special-pack/signup transfer cases. Access was revoked before the frozen snapshot. The correction then committed atomically once under `bop-full-rollback-2026-11-12-v1`. **It is complete: NEVER repeat it.** Durable receipt and private before/manifest/preview/result/after evidence are saved; permanent identity/aliases remain, credentials/recovery/sessions are revoked, baseline is 5,000 credits, inventory/gameplay reset, consumed special-pack marker retained, and five completed trades were reversed. Exact counterparty inventory and unchanged balances were verified live, including invested-copy and net-zero round-trip handling. Preserve all subsequent activity.
- Owner-only preview/apply/receipt helper has exact receipt/inventory/transfer guards and a PITR bookmark. Runtime source `8665176e4b326f5edd3ad2cc39047c71f844c028`, pushed and deployed to original Worker **e4ebc3dd-2fde-4297-8273-b7bc3176b428**. 466 tests, 216 syntax checks and dry-run build pass, including real Worker authorization and transaction failure/retry checks. Exact-source application and demo CI passed. Original Game/amqtours-economy-v1 and catalogue/imports retained.
- Special-pack transfer audit is complete and read-only; its report/evidence stay outside Git. No other accounts were revoked/reset. Similar transfer patterns do not establish shared ownership; registration times are not recorded. Any future correction requires separate user authorization and a new scope, never replay of this operation.

## Completed Task — One Score Per Player in Quiz Difficulty

- Codex owns `src/quiz.js`, existing quiz tests, `QUIZ.md`, and this entry. Base `6a5dacf`, clean and synchronized. Uses each player's personal-best submitted score once, from the existing unique player/quiz progress rows; retries carry no extra weight. Kept Score/Scores wording and all rewards/recaps intact. Removed the obsolete derived receipt index, preserved all receipts/player data, invalidated cached difficulty on host quiz-score resets.
- Reused the existing covering leaderboard index and 60-second statistics cache. Metadata exposes `scoreCount`; legacy `completedRuns` is an alias for open-client compatibility. Full suite: 463 passed; syntax 214 files; dry-run/diff checks passed. Existing regression covers repeat/lower attempts carrying no added weight, personal-best replacement, zero scores counting, preview receipts ignored, and host-score-reset invalidation.
- Runtime source `cffd275054fd73eb88641c19f526d27012467e3a`, pushed and deployed to original Worker **20e32b7b-46c0-4fed-a971-a3d7571ad528**; exact-source application CI passed. Live `/api/quizzes` returned unique-player scoreCount for all 113 published quizzes; a bounded public leaderboard's count and mean matched the difficulty statistics exactly; health 200. No production quiz plays/rewards/resets, no proxy or original economy identity changes.

## Completed Task — Quiz Score Count Wording

- Codex owns `public/quiz-ui.js`, its existing UI test assertion, and this entry. Base `d558690`, clean and synchronized.
- Difficulty already sorts by average submitted score, not attempt count. Renamed tile count Run/Runs to Score/Scores; calculation and sorting unchanged. 22 quiz UI tests passed, diff check clean. Runtime source `77071fc`, pushed and deployed to original Worker version **e52051bf-93de-43a8-a64e-4be01b315e10**; live quiz-ui.js returned 200 and matched source exactly. No production data operations or proxy changes.

## Completed Task — Completed Quiz Song Recap and Difficulty Sorting

- Codex owns `src/quiz.js`, `public/quiz-ui.js`, `public/features.css`, focused quiz tests, `QUIZ.md`, and this entry. Base `6fdcfb3`, clean and synchronized with main. Preserve Gemini's completed participation-reward changes and existing economy/importer data.
- Add finished-run-only song recap with correct/incorrect markers and per-song elapsed timestamps. Add easiest/hardest sorting by average score across retained completed non-preview attempts; keep unplayed quizzes last. Use indexed receipt statistics with a short cache instead of repeatedly parsing the receipt ledger. No production test attempts or reward changes.
- Implemented: Songs Played popup on finished quiz screen, showing 20 songs in play order, artist/anime, submitted answer, correct/incorrect/skip/timeout result, elapsed-from-start timestamp and per-song answer time. Server records timings at lock; legacy missing timings are explicit. No upcoming answer exposure. Mobile table scrolls horizontally; recap uses the saved finished snapshot and no extra request when opened.
- Added averageScore/completedRuns using partial expression index over unique completed non-preview `:quiz-next` receipts, 60-second cache invalidated on completion. Includes historical/repeat attempts; no stopped/unfinished runs. Both sort directions put unplayed quizzes last; averages/counts are shown on tiles.
- Checks: 463 tests passed across the full suite; enhanced Worker runtime test passed, verifies recap/average fields and six-SQL answer hot path. 214 syntax checks, dry-run build, diff check. In-memory browser QA: both difficulty directions, popup results/timings, finished-run refresh, close, desktop and 390px mobile overflow. Synthetic SQLite: 100,000 unrelated receipts + 2,000 completions → index creation ~9.69ms, cached-source aggregation ~0.15ms (local measurement, not a production guarantee).
- Runtime source `445f72fdd2a6f041ac0dce89f4e81ebec2b711ea`, pushed and deployed to original Worker **d433826a-6e2b-4c51-a6f8-c7a089d36852**. Exact-source application CI and demo CI passed. Live changed assets returned 200 and exactly matched source. After Cloudflare's deferred DO update window, live `/api/quizzes` returned valid historical averages/counts for all 113 published quizzes; health 200, anonymous quiz-run 401. Existing Game/amqtours-economy-v1, player activity, catalog/import checkpoints and proxy retained. No production test accounts, quiz plays or reward mutations.

## Previous Task — Support > 32 Players for Participation Credit Rewards with Rate Capped at 32-Player Default

- Gemini owns implementation/commit: `public/tour-rewards.js`, `public/tour-rewards-ui.js`, `public/host.js`, `src/engine.js`, `tests/host-workflows.test.mjs`, `tests/site-defaults.test.mjs`, `docs/collaboration/STATUS.md`.
- Base SHA: `5a0bdef`
- Other collaborator's work to preserve: Codex's background anime metadata enrichment pass, player accounts, economy/catalog state.
- Completed behavior / decisions:
  - Allowed pasting rosters with > 32 players (up to 500) for participation credit rewards without error:
    - In `public/tour-rewards.js`:
      - Expanded `TOUR_SIZES` to `[8, 16, 24, 32, 40, 48, 64, 80, 96, 128, 256, 500]`.
      - Updated `tourRewardDefaults(count)` to accept `count` up to 500 and infer the smallest capacity >= count, returning default `maxRounds = 5` for any tour size > 16 (other than 16 which defaults to 6, and 8 which defaults to 3).
      - Updated `participationRate(size)`: accepts `size` up to 500, returns 200 for <= 16, 300 for <= 24, and 400 for >= 25 (including 32 and any size > 32). This guarantees default participation rewards do not increase past 32 players (capped at 400 credits/round).
      - In `tourRewardQuote(players, plan)`: updated tour size validation to accept `plan.tourSize` up to 500.
    - In `src/engine.js`:
      - Updated `b.tourSize` bounds in `grant` action from `integer(b.tourSize, 1, 32)` to `integer(b.tourSize, 1, 500)`.
    - In `public/tour-rewards-ui.js`:
      - Ensured `availableSizes` in review modal includes `plan.tourSize` even if non-standard, dynamically rendering options and selecting the current size.
    - In `public/host.js`:
      - Imported `TOUR_SIZES` and rendered options dynamically up to 500 players, updating hint text to reflect "400 for 32 or more".
  - Unit tests:
    - In `tests/host-workflows.test.mjs`: Added rates testing for [40, 48, 64, 128, 500] all returning 400 credits/round, and added dedicated test `participation batch accepts more than 32 players with rate capped at 32-player default` verifying 36-player batch previews with tour size 40 / 5 rounds, quotes at 400/round, and awards 2,000 credits each atomically.
    - In `tests/site-defaults.test.mjs`: Verified `grant` with `tourSize: 64` awards 400/round, and `updateRewardDefaults` with `tourSize: 64` calculates 400 * games.
- Checks run and results: `node tools/check.mjs` (214 files passed), `node --test tests/*.test.mjs` (461/461 passed), `git diff --check` (clean).
- Runtime deployment version / live verification: Deployed to Cloudflare Worker `amqtours-gatcha` version **a43da2a1-5ae7-447d-9a57-cabb5e7bbf31** and `play` proxy version **c75902bc-5fb2-46da-9bdb-64e69ece5cc0**. Verified live read-only: `/api/health` (200, `{"ok":true,"service":"AMQ Tours Gatcha"}`), `/tour-rewards.js` (contains `TOUR_SIZES` and `whole(size, 1, 500, "Tour size")`). No manual data mutations.
- Integration owner / deployment owner: Gemini.

## Previous Task — Increase Wishlist Capacity to 1,000 Cards

- Gemini owns implementation/commit: `public/site-defaults.js`, `src/wishlist.js`, `public/demo-features.js`, `tests/site-defaults.test.mjs`, `tests/wishlist.test.mjs`, `docs/collaboration/STATUS.md`.
- Base SHA: `56dca26`
- Other collaborator's work to preserve: Codex's background anime metadata enrichment pass, player accounts, economy/catalog state.
- Completed behavior / decisions:
  - Centralized wishlist limit in `public/site-defaults.js`: added `export const MAX_WISHLIST = 1000;`.
  - In `src/wishlist.js`:
    - Imported and re-exported `MAX_WISHLIST`.
    - Updated limit check in `change(player, b)` from `500` to `MAX_WISHLIST`, throwing `Your wishlist can hold up to 1000 cards.`.
    - Existing cards on wishlist can still be re-saved idempotently at capacity without throwing.
  - In `public/demo-features.js`:
    - Imported `MAX_WISHLIST` from `./site-defaults.js`.
    - Enforced matching limit check for demo mock wishlist additions.
  - Unit tests:
    - In `tests/site-defaults.test.mjs`: Added assertion `MAX_WISHLIST === 1000`.
    - In `tests/wishlist.test.mjs`: Added comprehensive test verifying `MAX_WISHLIST === 1000`, successfully storing 1,000 wishlist cards, rejecting the 1,001st unique card with `Your wishlist can hold up to 1000 cards.`, allowing re-save of an existing card at capacity, removing a card and re-adding, 42-page wishlist pagination, 1,000-card reorder payload, and demo mock limit enforcement.
- Checks run and results: `node tools/check.mjs` (214 files passed), `node --test tests/*.test.mjs` (459/459 passed), `git diff --check` (clean).
- Runtime deployment version / live verification: Deployed to Cloudflare Worker `amqtours-gatcha` version **85841088-2516-45dd-abe6-9f24b2db4729** and `play` proxy version **639dd1d3-5498-450c-9dce-68c504bfda9e**. Verified live read-only: `/api/health` (200, `{"ok":true,"service":"AMQ Tours Gatcha"}`), `/site-defaults.js` (contains `MAX_WISHLIST = 1000`). No manual data mutations.
- Integration owner / deployment owner: Gemini.

## Previous Task — Align Profile Collection Checkbox Filters with Select Controls

- Gemini owns implementation/commit: `public/features.css`, `tests/wishlist.test.mjs`, `docs/collaboration/STATUS.md`.
- Base SHA: `830bfd1`
- Other collaborator's work to preserve: Codex's background anime metadata enrichment pass, player accounts, economy/catalog state.
- Completed behavior / decisions:
  - Fixed alignment mismatch between select dropdowns (`Sort By`, `Rarity`) and checkbox pills (`My Wishlist Only`, `Tradeable Only`) in collection toolbars:
    - In `public/features.css`:
      - Added `.collection-toolbar-main, .profile-collection-toolbar` alongside `.collection-toolbar .collection-toolbar-main` with `align-items: end;` so toolbar controls always sit on the bottom baseline instead of vertically centering.
      - Added `align-self: end;` to `.collection-checkboxes`.
      - Set `height: 34px; min-height: 34px; box-sizing: border-box;` on `.collection-checkboxes .check-label` to exactly match the 34px height of `.collection-toolbar-main select`.
      - Added `display: contents;` to `.profile-collection-toolbar .catalog-refinements`.
  - Unit tests:
    - In `tests/wishlist.test.mjs`: Added assertions verifying `.profile-collection-toolbar` aligns to `end`, `.collection-checkboxes` aligns to `end`, and `.check-label` matches `height: 34px`.
- Checks run and results: `node tools/check.mjs` (214 files passed), `node --test tests/*.test.mjs` (458/458 passed), `git diff --check` (clean).
- Runtime deployment version / live verification: Deployed to Cloudflare Worker `amqtours-gatcha` version **4a36afd3-d572-4123-abf4-02ff68e5410a** and `play` proxy version **247f80cd-6e54-4ef8-b73a-93b3d96c64f7**. Verified live read-only: `/api/health` (200, `{"ok":true,"service":"AMQ Tours Gatcha"}`), `/features.css` (contains `.collection-checkboxes align-self: end` and `height: 34px`). No manual data mutations.
- Integration owner / deployment owner: Gemini.

## Previous Task — Own Collection Tradeable Filter and Compact Checkboxes

- Codex owns `public/app.js`, `public/features.js`, `public/card-display.js`, `public/profile-cards-ui.js`, `public/features.css`, existing collection/wishlist tests, and this status entry. Base `c2c8fbe`, clean and synchronized with main.
- Added Tradeable Only to My Collection and the owner's profile Collection view, combining with existing filters and resetting via Clear Filters. Own collection filtering is local and adds no API polling.
- Grouped collection checkboxes into 32px inline controls with active/focus highlights; labels wrap as a group on narrow screens. Applied to own and public profile collections without changing unrelated checkboxes.
- Checks: 10 focused existing collection/wishlist tests passed; 214 syntax checks; Wrangler dry-run; isolated in-memory browser QA verified 5 cards → 1 marked tradeable card, Clear Filters restores all 5, and desktop/390px layout. Screenshot in local work evidence. No production test mutations.
- Runtime source `289b0fd3191da48cf98f154bb09a65552e269830`, pushed and deployed to original Worker version **6c628aa3-069a-49b2-9443-e666473510d0**. Live health 200; all five changed assets returned 200 and exactly matched source. Original economy/importer state and proxy preserved.

## Completed Task — Stable List Card Dialog and Working Trade Marker

- Codex owns `public/app.js`, `public/listing-form.js`, `public/features.css`, focused listing/card-action tests, and this status entry. Base: `8c87ddf` (clean checkout, matches origin/main).
- Scope: one-line listing venue choices, consistent dialog dimensions, fix the trade-menu routing that swallows `trade-toggle`, verify local interactions and deploy the existing Worker. No production data operations or proxy changes.
- Fixed `trade-toggle` being swallowed by the generic trade-board click handler. Trade/Protect ignore clicks during an existing mutation and roll back optimistic UI if saving fails.
- Listing choices now read Marketplace / Auction / Trade / Sell to Store in a single four-column row. A dedicated, viewport-bounded dialog frame keeps its dimensions across venue changes; the inner form scrolls on short screens.
- Checks: 20 focused listing/card-surface/wishlist tests passed (includes real click-handler regression, toggle off, busy guard, failed-save rollback); 214 JavaScript syntax checks; Wrangler dry-run; diff check. Isolated in-memory browser QA confirmed Trade selected state and visible For Trade marker after saving. Native dialog screenshot/mobile geometry QA unavailable: IAB does not render `showModal()` and Windows browser use was stopped by the tool's URL-policy limitation. No production test mutations.
- Runtime source `e3163f8`, pushed to main and deployed to original Worker `amqtours-gatcha` version **3ead4d0d-5a8c-41ba-bcda-f6ef83133f92**. Live play-address health returned 200; `app.js`, `features.css`, `listing-form.js` each returned 200 and exactly matched committed source. Proxy, original Durable Object, and all economy/catalogue state retained. No production data operations.

## Previous Task — Add Sell to Store & List for Trade to List Card Interface

- Gemini owns implementation/commit: `public/listing-form.js`, `public/app.js`, `tests/listing-form.test.mjs`, `docs/collaboration/STATUS.md`.
- Base SHA: `0f7cd6c`
- Other collaborator's work to preserve: Codex's background anime metadata enrichment pass, player accounts, economy/catalog state.
- Completed behavior / decisions:
  - Created `public/listing-form.js`:
    - Exported `listingModalHTML({ card, item, venue, variant, escape, number, quantityInput })` providing unified modal content for all 4 listing venues:
      - `Fixed-price marketplace` (`data-venue="shop"`): custom price listing on player marketplace.
      - `Timed auction` (`data-venue="auction"`): opening bid, duration, and buyout options.
      - `List for trade` (`data-venue="trade"`): list card for trade offers without currency price fields.
      - `Sell to store` (`data-venue="store"`): flat-price instant sale for 50% rarity price × invested card units, consuming the card copy permanently.
    - Preserves variant choice (`extra` vs `card`) and calculates instant store credits dynamically for the active variant.
  - In `public/app.js`:
    - Updated `listingForm` to use `listingModalHTML` with full 4-tab bar and protect checks.
    - Re-routed `openInstantSale(id, variant)` to `listingForm(id, "store", variant)`.
    - Handled tab switching across all 4 venues in `handleFeatureClick` for `listing-venue`, reading variant from either `#listing-form` or `#instant-sell-form`.
    - Handled `trade-list` in `handleFeatureSubmit` for `listing-form` when `b.venue === "trade"`, creating the trade listing and switching to the trades section if on the shop page.
    - Attached error rendering to `execute` for `instant-sell-form` and `listing-form`.
    - Updated card button title attribute on `List Card ↗` to reflect all options.
  - Unit tests:
    - In `tests/listing-form.test.mjs`: Added 7 test cases covering all 4 tabs, venue rendering, variant selection, flat store price calculation, and single vs multi-copy forms.
- Checks run and results: `node tools/check.mjs` (214 files passed), `node --test tests/*.test.mjs` (457/457 passed), `git diff --check` (clean).
- Runtime deployment version / live verification: Deployed to Cloudflare Worker `amqtours-gatcha` version **c29e18d8-8121-4d6a-93f4-56da638d08c8** and `play` proxy version **260aea34-b79f-45ac-be1b-93a3414dc83e**. Verified live read-only: `/api/health` (200, `{"ok":true,"service":"AMQ Tours Gatcha"}`), `/listing-form.js` (contains `Sell to store` and `List for trade`), `/app.js` (contains `listingModalHTML`). No manual data mutations.
- Integration owner / deployment owner: Gemini.

## Previous Task — Tradeable Only Filter in Other Players' Collection

- Gemini owns implementation/commit: `public/app.js`, `public/profile-cards-ui.js`, `public/demo-features.js`, `src/worker.js`, `src/wishlist.js`, `tests/wishlist.test.mjs`, `docs/collaboration/STATUS.md`.
- Base SHA: `3c8ca31`
- Other collaborator's work to preserve: Codex's background anime metadata enrichment pass, player accounts, economy/catalog state.
- Completed behavior / decisions:
  - In `public/profile-cards-ui.js`:
    - Added `<label class="check-label profile-collection-tradeable-toggle"><input type="checkbox" id="profile-collection-tradeable" ${filters.tradeable ? "checked" : ""}> Tradeable Only</label>` immediately following "My Wishlist Only" in the collection filters toolbar when viewing another player's profile collection (`!own`).
  - In `public/app.js`:
    - Added `tradeable: false` to `ui.profileCollection` state.
    - Included `(ui.profileCollection.tradeable ? "&tradeable=1" : "")` in `/api/player-cards` queries in `loadDynamic`.
    - Reset `ui.profileCollection.tradeable = false` on hash navigation, profile view tab changes, and clear filters.
    - Added `profile-collection-tradeable` to the global change listener to update state and reload the dynamic collection view.
  - In `src/worker.js`:
    - Extracted `tradeable: url.searchParams.get("tradeable") === "1"` from `/api/player-cards` and passed to `e.economy.wishlist.page(...)`.
  - In `src/wishlist.js`:
    - Filtered collection rows by `!!r.for_trade` before calculating total and slicing pages when `options.tradeable` is true, enabling smooth combination with wishlist filter, search query, role/rarity filters, and custom or date/stat sorting.
  - In `public/demo-features.js`:
    - Added mock demo support for `tradeable` query param filtering by `!!r.for_trade`.
  - Unit tests:
    - In `tests/wishlist.test.mjs`: Added tests verifying `tradeable: true` returns cards marked with `for_trade === 1`, combining `tradeable: true` and `wishlist: true` returns the intersection, `#profile-collection-tradeable` renders next to `#profile-collection-wishlist` on `own: false`, and neither appears on `own: true`.
- Checks run and results: `node tools/check.mjs` (212 files passed), `node --test tests/*.test.mjs` (450/450 passed), `git diff --check` (clean).
- Runtime deployment version / live verification: Deployed to Cloudflare Worker `amqtours-gatcha` version **f54c72f8-0337-4a4b-b539-fa0909680d14** and `play` proxy version **46fe9d7d-ff1b-4633-af1e-5df2a07a0331**. Verified live read-only: `/api/health` (200, `{"ok":true,"service":"AMQ Tours Gatcha"}`), `/profile-cards-ui.js` (contains `profile-collection-tradeable`), `/app.js` (contains `&tradeable=1`). No manual data mutations.
- Integration owner / deployment owner: Gemini.

## Previous Task — Trade Button Immediate Highlight & ⚖️ Marker, Collection Button Rename

- Gemini owns implementation/commit: `public/app.js`, `public/card-collectors.js`, `public/card-surface.js`, `public/card-surface.css`, `tests/wishlist.test.mjs`, `tests/card-surface.test.mjs`, `docs/collaboration/STATUS.md`.
- Base SHA: `b718ccc`
- Other collaborator's work to preserve: Codex's background anime metadata enrichment pass, player accounts, economy/catalog state.
- Completed behavior / decisions:
  - 1. Collection button label rename:
    - In `public/card-collectors.js`: renamed button text from `Owned/Wishlist (owned/wanted) ↗` to `Collection (owned/wanted) ↗` (or `Collection ↗` when counts unhydrated), with aria-label `Collection: X owned, Y wishlisted`.
    - In `public/app.js`: updated dynamic count hydration in `ensureCollectorCounts` to set `Collection (owned/wanted) ↗`.
  - 2. Trade button immediate toggle, highlight & ⚖️ icon on card:
    - In `public/app.js`: in `handleFeatureClick` for `trade-toggle`, added immediate optimistic in-memory inventory state toggle, updated button `is-selected` class, `aria-pressed="true"/"false"`, text `⚖️ For Trade` / `⚖️ Trade`, and called `syncCardFlags` immediately so the ⚖️ icon appears on the card surface right away. Added clean error rollback on failure. Added identical optimistic handling to `protect-toggle`.
    - In `public/app.js` (`cardHTML`): added `class="text-button ${item.for_trade ? "is-selected" : ""}"` and `forTrade: !!(item?.ownerFlags?.forTrade ?? item?.for_trade ?? cardFlags(c).forTrade)` directly so card surfaces and buttons retain their selected state across re-renders.
    - In `public/card-surface.js`: enhanced `syncCardFlags` to support both single `.card-surface` roots and container elements.
    - In `public/card-surface.css`: added `.card-action-grid :is([aria-pressed="true"], .is-selected)` styling and hover/focus styles so Trade and Protect buttons highlight with mint background and border just like Wishlist.
  - Unit tests:
    - In `tests/wishlist.test.mjs`: updated assertions to verify `Collection (2/1) ↗` format and aria-label.
    - In `tests/card-surface.test.mjs`: added test verifying `syncCardFlags` updates flags on single card roots and container elements, and CSS contains `.card-action-grid :is([aria-pressed="true"], .is-selected)`.
- Checks run and results: `node tools/check.mjs` (212 files passed), `node --test tests/*.test.mjs` (450/450 passed), `git diff --check` (clean).
- Runtime deployment version / live verification: Deployed to Cloudflare Worker `amqtours-gatcha` version **148a63f8-28df-420b-917e-f48514eed9e0** and `play` proxy version **25c9bf09-552d-4e62-b77e-682032d366c5**. Verified live read-only: `/api/health` (200, `{"ok":true,"service":"AMQ Tours Gatcha"}`), `/card-collectors.js` (contains `Collection...`), `/card-surface.css` (contains `.card-action-grid :is([aria-pressed="true"], .is-selected)`), `/app.js` (contains `forTrade: nextForTrade`). No manual data mutations.
- Integration owner / deployment owner: Gemini.

## Previous Task — Quiz Song Transition Prebuffering & Server Hot-Path Optimization

- Gemini owns implementation/commit: `src/engine.js`, `src/quiz.js`, `public/quiz-ui.js`, `tests/quiz.test.mjs`, `tests/quiz-ui.test.mjs`, `tests/quiz-runtime.test.mjs`, `docs/collaboration/STATUS.md`.
- Base SHA: `08c5298`
- Other collaborator's work to preserve: Codex's background anime metadata enrichment pass, player accounts, economy/catalog state.
- Completed behavior / decisions:
  - In `src/quiz.js`:
    - `runView(q, run)` now exposes `nextAudio` and `nextSample` once the current song is answered (`run.answers[run.index]` is locked) and `run.index < 19`, allowing the client to prebuffer and seek the upcoming song while the answer reveal screen is displayed without exposing upcoming titles or answers.
    - `action(player, "quiz-next", b)` accepts `b.ready === true` on intermediate song transitions (`run.index < 19`) to arm the new song's 20-second clock (`startsAt: now, endsAt: now + QUIZ_SONG_MS`) in the same request, eliminating the extra `POST /api/quiz-ready` network round trip after pressing Next Song.
    - Omitted redundant `me: e.player(player)` lookup on intermediate quiz moves (`!run.finished`), querying and returning `me` only when `run.finished` is true (the only step that can award credits/titles).
  - In `src/engine.js`:
    - Skipped the upfront `this.player(player)` SQL query (which ran correlated subqueries on `showcase_capacity` and `host_delegations`) for `quiz-ready`, `quiz-answer`, and `quiz-next`, cutting per-move Durable Object SQL statements on `quiz-answer` and intermediate `quiz-next` down to 6 lightweight primary-key queries.
  - In `public/quiz-ui.js`:
    - Added `prefetchNext()` and `dropPrefetch()` so that as soon as a song is answered, the client creates the next song's `Audio` element in the background, seeks to its sample offset on `loadedmetadata`, and marks it ready on `canplay`/`canplaythrough`/`seeked`.
    - When the player clicks `Next Song` (or presses `Enter` on the reveal screen) and the prefetched audio is ready, `mutate("quiz-next")` passes `ready: true` and `mount()` claims the prebuffered `Audio` element and starts playback immediately. If the player advances before prebuffering completes, `mount()` still reuses the in-flight `Audio` element rather than restarting the download.
  - Unit tests: added coverage in `tests/quiz.test.mjs`, `tests/quiz-ui.test.mjs`, and tightened SQL hot-path probe in `tests/quiz-runtime.test.mjs` (`probe.sql <= 6`).
- Checks run and results: `node tools/check.mjs` (212 files passed), `node --test tests/*.test.mjs` (448/448 passed), `git diff --check` (clean).
- Deployment note: Ready for review and deploy when requested.
- Integration owner / deployment owner: Gemini.

## Previous Task — One-Time 5-Card Special Pack (1 AG, 4 S-and-Up, 50% Character / 50% Seiyuu)

- Gemini owns implementation/commit: `src/special-pack.js`, `src/economy.js`, `src/engine.js`, `src/worker.js`, `src/aliases.js`, `src/economy-repair.js`, `public/pack-reveal.js`, `public/app.js`, `public/demo-features.js`, `tests/special-pack.test.mjs`, `docs/collaboration/STATUS.md`.
- Base SHA: `ff73f77` (with follow-up fix `08c5298` for `POST /api/special-pack-seen` and newly registered accounts)
- Other collaborator's work to preserve: Codex's background anime metadata enrichment pass, player accounts, economy/catalog state.
- Completed behavior / decisions:
  - Created `src/special-pack.js`:
    - `SpecialPack` class backed by `special_packs(player TEXT PRIMARY KEY, granted_at INTEGER NOT NULL, cards TEXT NOT NULL, seen INTEGER NOT NULL DEFAULT 0)`.
    - `drawFive()` draws 1 AG card guaranteed and 4 cards S-and-up (`["S", "SS", "SSS", "Ubers", "AG"]`).
    - Every card drawn rolls 50% Character / 50% Seiyuu first (`rand(2) === 0 ? "character" : "seiyuu"`), then uniformly selects among qualifying cards in that pool.
    - Avoids duplicate cards within the same pack when pool permits.
    - `ensureGranted(player)` grants the pack to registered players (`password IS NOT NULL`) or players with prior activity (`earned > 5000` or existing inventory) exactly once, immediately inserting the 5 cards into inventory.
    - `pendingPopup(player)` returns `{ cards }` while `seen === 0`.
    - `markSeen(player)` updates `seen = 1`.
  - Added `special_packs` to `src/economy.js`, `src/aliases.js` (identity migration), `src/economy-repair.js`, and `src/engine.js` (reset-player/reset-all).
  - In `src/worker.js`: executes `e.economy.specialPack.ensureGranted(session.player)` inside `e.tx()` when authenticated players request `state`, and handles `special-pack-seen` on both GET and POST.
  - In `src/engine.js`: returns `specialPack: { cards }` on `state(id)` if `seen === 0`, and includes all 5 card references in `catalog`.
  - Added action `special-pack-seen` in `src/economy.js` and demo fallback in `public/demo-features.js`.
  - In `public/pack-reveal.js`: updated sealed cinematic pack to render `SPECIAL BONUS PACK` eyebrow, AG aura glow, and results actions (`My Collection ↗` and `Continue`).
  - In `public/app.js`: automatically displays the special pack pop-up modal on site refresh or after login when `state.specialPack` is present, and acknowledges via `api("special-pack-seen", {})`.
  - Unit tests: `tests/special-pack.test.mjs` verifying draw distribution, 50/50 kind split, single-grant idempotency, inventory updates, state responses, and reset handling.
- Checks run and results: `node tools/check.mjs` (212 files passed), `node --test tests/*.test.mjs` (446/446 passed), `git diff --check` (clean).
- Runtime deployment version / live verification: Deployed to Cloudflare Worker `amqtours-gatcha` versions **c157927c-e089-4f34-aa60-e47ee16c0f53** and **e6e5237c-ad09-4bb1-ba12-e33c1bd90bb8**. Verified live read-only: `/api/health` (200, `{"ok":true,"service":"AMQ Tours Gatcha"}`), `/pack-reveal.js` (200, contains `SPECIAL BONUS PACK`). No manual data mutations.
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

## Completed Task — AMQ Plus Quiz Masterlist

- Codex owns quiz answer/import/source modules, a bounded cached masterlist refresh service, host quiz masterlist controls, compact generated seed data/tooling, focused quiz tests and quiz/collaboration docs. Base025cd06a1c41e816e83a4beeccf765311598edae; clean/synchronized at start. Preserve other collaborators' changes and production economy.
- User supplied AMQ Plus clone/data under 2026-11-11/cah:38194songrecords/38200requestedIDs, plus per-song working-titles. Six API-missing IDs retained as missing. AMQ JSON working answers take priority; this is fallback integration and refresh, not the future large-pool quiz mode. Do not run historical answer repairs, reward resets or player activity.

- Implementation complete locally:193 bounded seed JSON assets (38194records,6explicitmissing), independent QuizLibrary actor/binding with additive migration, conservative400-ID/30s resumable refresh, AMQ JSON title/audio priority, selected-quiz additive sync, and host controls that preserve unsaved form inputs. Source requests are fixed public endpoints; metadata cache has no player/economy state.
- Checks:480tests pass,230syntax checks, production dry-run and diff check pass. Workers runtime verifies the new namespace/service binding and anonymous rejection; timed quiz hot path remains7SQL/0market/0schedule/0starter work. Upstream read-only probe:current working map38200IDs HTTP200 and one-song metadata lookup HTTP200. No full re-scrape or production quiz/reward mutation.
- Runtime source **e27c12781cfe7b692313b8f3e99fa63da396fa12** committed/pushed to main and deployed to original Worker **13d8f20e-2d8e-456c-9428-913517fd074f**. Exact-source application CI43331690858 and demo CI43331690844 passed. Subsequent documentation commits record this release; they are not a separate runtime deployment.
- Live read-only verification at2026-11-12T23:52Z: eight changed assets match exact release bytes; health200; anonymous source status401; authenticated status200 confirms seed38194/38200 with six expected missing IDs,30-second interval,400-ID batches and no running job. The initial old-code405 resolved after Cloudflare's normal deferred actor adoption. No unchanged redeploy or reset was used.
- Browser QA unavailable for this chat; no visual/browser success is claimed. Host interaction logic tested through the actual bundled submit/tab handlers (including preserving unsaved form content). Local preview stopped. No production refresh, quiz sync, attempt, reward or financial mutation was used for QA; only the separate metadata actor initialized its source status. Original GAME/Game/amqtours-economy-v1 and player/import state preserved.
- Evidence in surrounding workspace:work/QUIZ-MASTERLIST.md,quiz-library-live-proof.json,quiz-library-upstream-proof.json and check/test/build/deploy logs. No implementation remains pending. Future large-pool quiz mode is outside this request; reinforcing upstream data is supported by source refresh or the seed rebuild tool. Integration/deployment owner:Codex; no concurrent task claimed.

## Gatcha Code and Test Cleanup

Codex removed the retired fusion roll, the unused pick’em schedule builder and the hidden recent-cards screen. Historical receipts, reversal support and the import-history API remain available. The catalogue shares the existing card-type selector. Host quiz status polling now uses a shared handler, and the masterlist modules use readable multiline formatting.

The suite went from 480 to 472 tests. Listing tests exercise venue-specific controls and sale quotes with shared fixtures. Retired-screen assertions, a literal home-page markup check and a form-ID check duplicated by the bundled host form test were removed. All 472 tests passed, along with 227 syntax checks, the Worker dry-run build and diff checks. This is a source cleanup with local verification. Production remains on the previously documented release.

## Host Console Entry Performance

Runtime commit 9bf9fa4 is live on the original Worker, version 664ec1f7-3562-4934-89d9-d69e48c1f1a9. During investigation, the public page, health check and protected data endpoints responded. Previously, startup fetched player state, the full host overview and a 16,046,386-byte quiz list in sequence. Returning hosts now request the Credit Rewards section directly. Other sections load when selected. Host quiz summaries link to the versioned cover endpoint and retain draft access checks.

After rollout the live rewards request returned 70,028 bytes in 351 ms and the quiz index returned 48,421 bytes. Guest requests returned 401. A warm headless Chrome check using read-only host authorization displayed the rewards form in 1.17 seconds and rendered all eight tabs. These are individual samples. All 472 tests, syntax checks, dry-run build and both runtime-commit CI workflows passed.
