# Quiz Operations

Draft quizzes are visible and playable only to hosts, with a Draft · Hosts Only badge. Host previews never change personal bests, credits, milestone rewards or titles. Other players see only published quizzes; with none published, they see Coming Soon.

## Import

Upload an AnisongDB array (or an object containing `songs`). Recognized audio fields: `audio`, `audioUrl`, `audio_url`, `mp3`, `songLink`. Bare AMQ MP3 filenames (for example, `dntpj0.mp3`) resolve to `https://naedist.animemusicquiz.com/`. Full URLs must be HTTPS and end in .mp3. Video-only rows are skipped. An upload with no playable matched songs returns a clear error without changing the pool. Anime ANN IDs and AMQ/ANN song IDs resolve to AMQ's master list; unmatched rows and video-only rows are skipped and reported. Repeated audio URLs are deduplicated. The import response lists skipped row numbers and reasons. Uploading a replacement JSON replaces the pool, while active runs retain their question/answer snapshots.

Covers support PNG/JPEG/WebP up to 300 KB. Song files up to 4.5 MB / 2,000 entries. Host requests have a 5 MB ceiling. Retry receipts store a SHA-256 digest instead of duplicating the imported pool, and retries avoid fetching AMQ again. AMQ master data is cached in memory for 24 hours; only anime/title metadata is retained.

## Rewards

Personal best and milestone payments are committed in the same transaction as the final answer advancement. One progress row per player/quiz prevents repeated awards, even with different request keys. Runs store only the latest attempt for each player/quiz. Perfect-score titles are derived from saved best scores and the host's configured title.

## Routes

- GET /api/quizzes — published tiles and personal bests; signed-in hosts also see draft previews.
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

If AMQ blocks requests from Cloudflare, imports use the bundled compact title/song index (same AMQ master-list version). Both live and fallback data are cached for 24 hours. Refresh the fallback from a machine with access using `node tools/refresh-quiz-answers.mjs`, then deploy the updated asset. Only names and song IDs are retained; songs and videos are not copied. If both sources fail, no pool is changed. Host save responses include the answer-source mode and version for diagnostics.

## Playback

Each song uses a 20-second MP3 sample and a server-persisted 20-second answer deadline. The first question has a two-second countdown after audio loads; subsequent songs start immediately when ready. Refreshing retains the same sample and deadline. The browser submits the current answer at zero. The server allows one second for network transit, then rejects late correct answers as timed out. Failed media can be retried or skipped.

Audio autoplays, with an Enable Audio fallback if the browser requires a gesture. Volume starts at 30% and remembers changes, including mute. The current score remains visible. The title bank is cached per quiz/version and searched locally without per-keystroke requests. Mouse selection or arrow keys and Enter fill the answer; Lock Answer submits it.

## Profile Titles

My Profile → My Titles lets players choose which earned quiz titles appear on their public profile. Existing and newly earned titles are equipped by default. Visibility does not change quiz scores, rewards or ownership. Host is supplied by the effective administrator role, always equipped above earned titles and styled as AG; it cannot be hidden or forged through title preferences.

GET `/api/my-titles` and POST `/api/equip-titles` require a player session. The POST body is `{quizzes:[QUIZ_ID,...]}` containing only earned titles. Visibility survives canonical-ID migration and clears with player gameplay resets. No existing player was reset for this change.

## Browse Sorting

The compact Sort By control includes Recently Updated, Alphabetical (A–Z), Unplayed First, Song Pool (largest or smallest first), and both Performance directions. Unplayed uses recorded completion status, so a completed zero-score quiz is still played. Sorting stays within the selected Singers/Composers category, preserves the server order for ties, and makes no additional API requests.

## Answer Submission and Recovery

Quiz start/restart/stop/readiness/answer/next actions and quiz-run recovery use a compact authenticated path that skips global starter scans, market maintenance and alarm rescheduling. The existing shared alarm continues handling markets/imports; quiz timing, scoring, rewards and durable receipts are unchanged. Responses reuse the validated in-memory run after persistence instead of reading and parsing it again.

The browser pauses audio on answer lock, bounds quiz requests to 12 seconds, retains the same idempotency key for an unchanged retry, and checks the authoritative run after an ambiguous answer failure. An already-saved answer reveals its recorded result; an unsaved failure re-enables retry. It never invents a correct answer locally. Quiz completion displays its saved score/rewards immediately, while optional list/leaderboard refreshes run separately and cannot hide a completed result if they fail. Network and shared-object contention can still cause variable response times.
