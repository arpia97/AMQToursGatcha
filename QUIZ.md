# Quiz Operations

Quiz is also playable at `https://amqtours.app/play/quiz` through the same UI module and original API. Gacha keeps its Quiz tab; accounts, published pools, favorites, personal bests, leaderboards, credit policies and completion titles are shared. Play does not copy or migrate quiz data.

During play,20 centered progress squares sit directly above the hotkey hints without a visible label or counter. Submitted answers turn green/red, the current unanswered song is yellow, and upcoming songs are neutral. Server run views return only submitted outcome booleans, keeping the strip accurate after reloads in normal and competitive sessions without exposing future answers. Restart clears the strip; completed runs retain all20 outcomes.

Quiz categories are **Singers**, **Composers** and **Franchise**, available both in browsing and host creation/editing. Franchise quizzes award **no credits**, including improvement and milestone bonuses; this is enforced during server settlement. Scores, timings, leaderboards, favorites and completion titles work normally. Reward history still prevents reissuing previously reached milestones after edits or score resets. Singers and Composers retain their existing rewards.

Draft quizzes are visible and playable only to hosts, with a Draft · Hosts Only badge. Host previews never change personal bests, credits, milestone rewards or titles. Other players see only published quizzes; with none published, they see Coming Soon.

Each quiz tile has a heart for the signed-in player's saved favorites. The separate **Favorites First** checkbox prioritizes favorites inside the current category/search results, retaining the selected sort within the favorite and remaining groups. It never hides matching nonfavorites. Favorites do not require a submitted score, survive score resets, follow canonical player identity changes, and are removed when the quiz or player gameplay is deleted/reset. Saving uses an authenticated, receipt-protected preference endpoint without loading full game state or triggering market/starter housekeeping.

Hover an Anime label in Song List to view all working titles (the union of saved answers and additional working titles). Display labels still follow the English/Romaji preference. The same preference is available in Settings and in the top bar; changing either synchronizes both immediately and saves the browser preference without submitting profile changes.

## Import

Upload an AnisongDB array (or an object containing `songs`). Recognized audio fields: `audio`, `audioUrl`, `audio_url`, `mp3`, `songLink`. Bare AMQ MP3 filenames (for example, `dntpj0.mp3`) resolve to `https://naedist.animemusicquiz.com/`. Full URLs must be HTTPS and end in .mp3. Video-only rows are skipped. An upload with no playable matched songs returns a clear error without changing the pool. AMQ JSON title/working-answer fields take priority. Song IDs also resolve against AMQ's master list and the secondary AMQ Plus cache; rows without any accepted title or playable MP3 are skipped and reported. Repeated audio URLs are deduplicated. The import response lists skipped row numbers and reasons. Uploading a replacement JSON replaces the pool, while active runs retain their question/answer snapshots.

Covers support PNG/JPEG/WebP up to 300 KB. Song files up to 4.5 MB / 2,000 entries. Host requests have a 5 MB ceiling. Retry receipts store a SHA-256 digest instead of duplicating the imported pool, and retries avoid fetching AMQ again. AMQ master data is cached in memory for 24 hours; only anime/title metadata is retained.

## Completed Run Recap and Difficulty

Profile Quiz → Current #1s sorts Quiz, Category and Time in either direction by clicking the column header; missing times stay last. Sorting is local to that table. Friends Only on a quiz leaderboard compares outgoing adds plus the viewer. Optional friend quiz alerts are off by default in Settings; see FRIENDS.md for crossing, deduplication and privacy rules.

Anime labels in the public Song List, answer reveal and Songs Played recap follow the site's Anime Titles preference (English/Romaji). `public/quiz-title-display.js` resolves imported aliases to AMQ's labelled main names using a separate static, cached name index; it does not change accepted answers, the player's submitted text or grading. Existing quizzes require no reimport. If the preferred translation is missing, the other main name is used; unknown or ambiguous aliases retain their original label. `node tools/build-quiz-title-names.mjs` rebuilds the index from the bundled AMQ master; `tools/refresh-quiz-answers.mjs` refreshes both together. Only anime names are included, with no song-to-answer mappings or per-song requests.

The finished result screen has a **Songs Played** popup for that attempt's 20 songs, in play order: correct/incorrect (green/red), song/artist, anime, submitted answer, elapsed timestamp from the first song, and time taken to answer that song. Timing is server-recorded on answer lock and includes network arrival; the elapsed clock includes loading between songs and review pauses. Skips and expired answers are marked explicitly. Older retained runs without per-song timing display **Not Recorded**. The recap survives refresh of the finished attempt and is replaced when the player starts a new attempt. Upcoming song metadata is never exposed by this feature during play.

Difficulty sorting uses highest/lowest **average personal-best score, with exactly one submitted score per player per quiz**. Retrying a quiz never adds another vote to its average; improving a personal best replaces that player's contribution. Quizzes with no submitted scores sort last in both directions. Tiles show the average out of 20 and number of player scores. Existing unique player/quiz progress rows and their covering leaderboard index supply historical scores; a 60-second cache avoids repeated aggregation. Completions and host quiz-score resets invalidate the cache. Score resets remove those scores from the difficulty calculation; stopped/unfinished runs and draft previews do not count. The legacy API field `completedRuns` aliases the unique-player `scoreCount` for older clients during rollout.

## Rewards

Personal best and milestone payments are committed in the same transaction as the final answer advancement. One progress row per player/quiz prevents repeated awards, even with different request keys. Runs store only the latest attempt for each player/quiz. Perfect-score titles are derived from saved best scores and the host's configured title.

## Routes

- GET /api/quizzes — published tiles and personal bests; signed-in hosts also see draft previews.
- POST /api/quiz-favorite — authenticated `{quiz, favorited: boolean}` preference; accepts an idempotency key and returns the saved state.
- GET /api/quiz-answers?quiz=ID&bank=1&page=N — scoped title bank in pages of 1,000 for immediate local autocomplete.
- GET /api/quiz-answers?quiz=ID&q=PREFIX — up to 20 autocomplete titles.
- GET /api/quiz-run?quiz=ID — authenticated current question, never the answer key before locking.
- POST /api/quiz-start — start/resume a run.
- POST /api/quiz-ready — arm the current question once audio is ready.
- POST /api/quiz-answer — lock an answer for the expected run ID/index, or skip with an empty answer.
- POST /api/quiz-next — advance or finish and award.
- GET /api/host/quizzes — host-only drafts and published configurations.
- POST /api/host/quiz-save — host-only import, cover, title, and publication.

Answers are validated against the server's saved alternatives; client-reported scores have no effect. Economic mutations use existing session, origin, burst and idempotency protections. Media is loaded by the browser over HTTPS; no video player is created.

Host form submissions read their actual HTML ID attribute, so the hidden quiz ID cannot shadow the submit route. A frontend regression test executes the bundled host console and submits this exact form shape; Worker tests cover filename-based imports, private drafts and empty-pool rejection.

If AMQ blocks requests from Cloudflare, imports use the bundled compact title/song index (same AMQ master-list version). Both live and fallback data are cached for 24 hours. Refresh the fallback from a machine with access using `node tools/refresh-quiz-answers.mjs`, then deploy the updated asset. This AMQ snapshot retains names and song IDs; songs and videos are not copied. If AMQ is unavailable, host AMQ JSON names and the secondary song cache can still resolve imports. With no usable title source, no pool is changed. Host save responses include the answer-source mode and version for diagnostics.

## Isolated Quiz Sessions

Both normal and Competitive starts from the current UI request a dedicated SQLite QuizSession actor (QUIZ_SESSIONS, one actor per run). Competitive additionally finishes downloading the full quiz pool into tab-local MP3 blobs before starting; normal playback buffers songs as needed. The original economy remains GAME / Game / amqtours-economy-v1, with the existing additive v3-quiz-sessions migration. Older runs retain their saved transport until finished/restarted, and deployments without the session binding retain the legacy fallback.

Only setup, authenticated resume, stop/restart and final reward settlement use Game. Ready, answer lock, intermediate Next and lost-response reconciliation use /api/quiz-session?run=ID, with the original same-origin session cookie and an X-Quiz-Session ticket. Tickets are HMAC-SHA256, domain-separated from other uses of the existing runtime host secret, bound to the run and cookie hash, and valid for at most 12 hours or the login expiry. The Worker verifies the ticket before looking up an actor. Cookies, secret keys and tickets must never be logged. Reopening through Game renews the ticket; logout/access-reset/lock revokes actor access. New valid logins may resume the retained run after an authorized reopen. Stop/restart tombstones the old actor. Temporary session state and its bounded move receipts expire after 30 days; permanent submitted scores and economic evidence remain in Game.

The session persists each answer before returning its reveal. The session API does not expose unrevealed song-answer matches or the full run order. The public Song List and full-pool audio preload remain intentionally public, with independent download/list ordering; these are not an anti-fingerprinting mechanism. No locally decryptable answer key is shipped. A small online lock/reveal acknowledgment is still necessary: this is not offline play, and it does not accept client scores, backdated client timestamps or unverified answer batches.

Once the next sample is buffered and seeked, Next immediately starts that audio and opens the input while its server acknowledgment completes in the background. The acknowledgment updates the authoritative deadline without replacing the focused input. The answer textbox, suggestions, Lock and Skip remain usable while Next is being acknowledged; one queued lock pauses audio immediately and is sent exactly once after Next is confirmed. Repeated locks cannot replace that saved answer. Failed Next is reconciled from the saved session, or returns to the previous reveal with a retry message. Stable per-move receipts protect retries; old endpoints cannot advance isolated runs. Shared question-state code preserves the 20-second deadline and one-second network grace on both paths.

Completion time for both normal and isolated-session play starts at the first server-authorized song start (or an earlier skip), excluding the initial pool download and starting countdown, and ends at the trusted final answer arrival. Review pauses and network transit still count. Final settlement imports only the actor's private completed snapshot, rechecks the active run/login/account lock/quiz visibility, and awards through the existing transactional personal-best/milestone receipt. Replayed finish requests cannot pay twice. Older personal-best durations are corrected using the first song’s recorded start and the saved finish. Untimed scores stay untimed, and quiz points and rewards are preserved.

## Playback

Each song uses a 20-second MP3 sample and a server-persisted 20-second answer deadline. The first question has a two-second countdown after audio loads; subsequent songs start immediately when ready. Refreshing retains the same sample and deadline. At zero, the browser submits the highlighted suggestion, the first suggestion if Autolock is on, or the typed answer if neither applies. The server allows one second for network transit, then rejects late correct answers as timed out. Failed media can be retried or skipped.

Audio autoplays, with an Enable Audio fallback if the browser requires a gesture. Volume starts at 30% and remembers changes, including mute. The current score remains visible. The title bank is cached per quiz/version and searched locally without per-keystroke requests. Mouse selection or arrow keys and Enter fill the answer; Lock Answer submits it.

## Profile Titles

My Profile → My Titles lets players choose which earned quiz titles appear on their public profile. Existing and newly earned titles are equipped by default. Visibility does not change quiz scores, rewards or ownership. Host is supplied by the effective administrator role, always equipped above earned titles and styled as AG; it cannot be hidden or forged through title preferences.

GET `/api/my-titles` and POST `/api/equip-titles` require a player session. The POST body is `{quizzes:[QUIZ_ID,...]}` containing only earned titles. Visibility survives canonical-ID migration and clears with player gameplay resets. No existing player was reset for this change.

## Browse Sorting

The compact Sort By control includes Recently Updated, Alphabetical (A–Z), Unplayed First, Song Pool (largest or smallest first), and both Performance directions. Unplayed uses recorded completion status, so a completed zero-score quiz is still played. Sorting stays within the selected Singers/Composers category, preserves the server order for ties, and makes no additional API requests.

## Answer Submission and Recovery

Quiz start/restart/stop/readiness/answer/next actions and quiz-run recovery use a compact authenticated path that skips global starter scans, market maintenance and alarm rescheduling. The existing shared alarm continues handling markets/imports; quiz timing, scoring, rewards and durable receipts are unchanged. Responses reuse the validated in-memory run after persistence instead of reading and parsing it again.

The browser pauses audio on answer lock, bounds quiz requests to 12 seconds, retains the same idempotency key for an unchanged retry, and checks the authoritative run after an ambiguous answer failure. An already-saved answer reveals its recorded result; an unsaved failure re-enables retry. It never invents a correct answer locally. Quiz completion displays its saved score/rewards immediately, while optional list/leaderboard refreshes run separately and cannot hide a completed result if they fail. Network and shared-object contention can still cause variable response times.

Title order can be arranged by dragging the handles in My Titles (touch or mouse), or by using arrow/Home/End keys on a handle, then saving. The mixed quiz/card-title order is saved separately from visibility and Host stays fixed above earned titles. A player can earn one title per unique card ID; repeatedly reaching MAX for the same card does not award another. Historical repeat awards remain recorded but resolve to one stable, earliest award in My Titles and public profiles. Any equipped repeat keeps that card's title equipped, saved duplicate order keys resolve to the earliest position, and subsequent visibility saves update the complete card group. Distinct cards sharing a name, character/seiyuu overlaps, and matching quiz titles stay separate with their correct rarity/style. No title history, cards or credits are deleted. New unique-card awards append. Saves reject stale or foreign orders before changing preferences. The `profile_title_order` table follows canonical identity migration and gameplay resets. Old clients can still update visibility by card ID without replacing the saved order.


## Audio Lifecycle and Recovery

The next song still prebuffers during the answer reveal. The client checks current media readiness (future playback data, no seek and no media error) again before requesting the fast next-song start; a stale preload flag cannot arm the clock. Finished, discarded and failed players detach their listeners and release their media source/decoder instead of retaining paused sources. A claimed preload detaches its old handlers before taking over the current-song handlers.

Media decode/load failures and non-autoplay play-promise failures get one automatic replacement with a fresh player using the selected server's direct MP3 URL. Competitive blob URLs use explicit audio/mpeg MIME, including when the upstream returned generic headers. A genuine NotAllowedError still shows Enable Audio. If the replacement also fails, Retry Audio replaces the player again rather than repeatedly loading the same failed element. Recovery seeks to the sample plus already elapsed time, and never restarts or extends a server deadline. Leaving/stopping releases current and pending players; competitive downloaded files retain the existing tab-session lifetime. No quiz scoring, rewards, source pools or stored attempts are changed.

## AMQ Plus Song Cache and Refresh

The supplied AMQ Plus dataset is now a secondary source for song metadata, missing MP3 links and working anime titles. Host-provided AMQ JSON `songInfo` anime names and alternative-title fields take priority over AMQ Plus. Player guesses are never treated as answers. Existing AMQ live/bundled names remain available; incomplete fallback data cannot replace explicit export answers. Appending duplicate MP3s preserves that priority. The stored `answerSource` marks newly imported AMQ exports; older pools with saved explicit working titles are protected during synchronization.

Seed provenance: AMQ Plus commit `be36d89202b48e1a0e3fe7542cd625a2860a469c`, 38,194 returned songs for 38,200 requested IDs. Original song JSON SHA-256: `dbadc351ac0702361209fa24fe3be9b845231645f76e5b246bdddf9579c400f2`. The six API-missing IDs remain explicit: 3249, 11315, 11444, 12300, 14117, 38061. `public/quiz-library/` holds a compact 512-ID-sharded lookup, approximately 13.4 MB of song metadata plus working-title shards and a 0.56 MB manifest. No 98.7 MiB JSON parse or MP3 download runs in the Worker. Imports load only needed shards, with a bounded eight-shard LRU. The original full JSON remains in the user's supplied project; it is not copied into this repository.

Host Console → Quiz → **Song Masterlist & Alternative Titles** offers **Refresh Masterlist & Titles**, progress, Pause/Resume/Cancel, the current song count and missing-ID count. Refresh fetches the current per-song working-title map from `4Lajf/amq-plus` main, then sequential AnisongDB `ann_song_ids_request` batches of at most 400 IDs. There is at least 30 seconds after each completed batch/phase before the next request. A full refresh of the supplied pool takes roughly an hour without backoff. It continues on the server after the browser/PC closes. No player visit starts a scan. Refresh also expires the existing AMQ source cache for the next import.

HTTP Retry-After, exponential backoff, persisted cursors, a 90-second lease and source/count/ID validation protect refreshes. Six consecutive errors pause the job. Resume honors the saved delay. New starts have a ten-minute guard; repeated idempotency keys do not start duplicate jobs. A cancelled/paused/stale fetch cannot publish. Missing/invalid metadata retains older cached records where possible, and missing audio retains an older MP3. Only a fully validated staged generation switches the active pointer. At most two data generations are retained; temporary title shards are removed after publication. A source shrinking by more than 10%, or exceeding the current safe 80,000-ID index bound, is rejected while the last usable cache remains active.

Persistence is a separate SQLite-backed Durable Object: binding `QUIZ_LIBRARY`, class `QuizLibrary`, named instance `quiz-song-library-v1`. The additive `v2-quiz-library` migration creates only that metadata class. Original `GAME`/`Game`/`amqtours-economy-v1`, old migrations and all gameplay state remain unchanged. The cache actor has its own alarm and no player/economy tables, so its metadata queue is separate from quiz answering. Host status polls are small and do not run the main economy's starter/market housekeeping. Browser polling updates only the source status region, preserving unsaved quiz fields and file selections.

For an existing quiz, select it and use **Sync This Quiz’s Fallback Answers**. This is an explicit, revision-checked, idempotent, additive update to that pool and its autocomplete bank. It skips AMQ-export/explicit-working-title songs. It does not change scores, rewards, titles or active-run question snapshots. Refreshing the source alone never rewrites all saved quizzes. Normal saved-pool/active-run behavior remains in place. No larger-pool random quiz mode is enabled by this integration.

New host routes (existing host/session, origin and retry protections): GET `/api/host/quiz-master`; POST `/api/host/quiz-master-refresh` with action `start|pause|resume|cancel`; POST `/api/host/quiz-master-sync` with `quiz`. The internal metadata actor is not a public API.

To rebuild the seed from reinforced local files, run `node tools/build-quiz-library.mjs <masterlist.json> <working-titles.json> [source-commit]`, validate, and deploy the generated assets. The tool rejects duplicate/unexpected song IDs and records input hashes/missing IDs. It retains only the fields used by current matching and future song-pool selection: IDs, title/artist, MP3 URL, working names, type, Dub status, difficulty and linked anime IDs. Reinforcing raw source data does not automatically alter saved quiz answer keys. Rebuild the Play Dub index for existing recordings with `node tools/build-play-dub-index.mjs <masterlist.json>` using the raw list and the bundled official AMQ snapshot.


November16 UI: Song List and recap anime labels open a fixed hover/focus/tap popup with all saved working titles, without native-tooltip delay or clipping in the table. Popups close on Escape, outside interaction, list sorting/closing or when their row leaves the visible table area. Favorites use the approved Pulse frameless SVG heart/status light.

The host form checks Quiz Name against other quizzes already in the protected host index, across Singers/Composers and Draft/Published. Unicode width, letter case and repeated whitespace do not hide a match; the edited quiz itself is excluded. The warning updates while typing and during pool automod checks, and remains advisory so deliberate same-name category overlaps can still be saved. Song-title, audio-link and import checks are unchanged.

Autocomplete reuses a WeakMap index of each bank’s normalized, shortest-first titles. Bank growth rebuilds the index; queries scan until 20 matches without re-normalizing or sorting every title for each keystroke.

Quiz and multiplayer answer suggestions rank exact names first, then distinct complete query words, then contiguous query text (including fragments across word boundaries), then word prefixes, then substring matches. Within the same relevance tier, shorter titles remain first. Word order and comma-free name search still work. For example, `shana s` prefers `Shakugan no Shana S` over the shorter `Shakugan no Shana`. Matching ranks suggestions only; grading still uses saved accepted answers.

A query such as `ge r` or `enge r` ranks `Masamune-kun's Revenge R` ahead of `Masamune-kun's Revenge`, since only the sequel contains that contiguous text. This complements the complete-word priority for `shana s`.
