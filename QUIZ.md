# Quiz Operations

Quizzes are hidden drafts until explicitly published by a host. With no published quizzes the player tab says Coming Soon.

## Import

Upload an AnisongDB array (or an object containing `songs`). Recognized audio fields: `audio`, `audioUrl`, `audio_url`, `mp3`, `songLink`. Bare AMQ MP3 filenames (for example, `dntpj0.mp3`) resolve to `https://naedist.animemusicquiz.com/`. Full URLs must be HTTPS and end in .mp3. Video-only rows are skipped. An upload with no playable matched songs returns a clear error without changing the pool. Anime ANN IDs and AMQ/ANN song IDs resolve to AMQ's master list; unmatched rows and video-only rows are skipped and reported. Repeated audio URLs are deduplicated. The import response lists skipped row numbers and reasons. Uploading a replacement JSON replaces the pool, while active runs retain their question/answer snapshots.

Covers support PNG/JPEG/WebP up to 300 KB. Song files up to 4.5 MB / 2,000 entries. Host requests have a 5 MB ceiling. Retry receipts store a SHA-256 digest instead of duplicating the imported pool, and retries avoid fetching AMQ again. AMQ master data is cached in memory for 24 hours; only anime/title metadata is retained.

## Rewards

Personal best and milestone payments are committed in the same transaction as the final answer advancement. One progress row per player/quiz prevents repeated awards, even with different request keys. Runs store only the latest attempt for each player/quiz. Perfect-score titles are derived from saved best scores and the host's configured title.

## Routes

- GET /api/quizzes — published tiles and the current player's personal best.
- GET /api/quiz-answers?quiz=ID&q=PREFIX — up to 20 autocomplete titles.
- GET /api/quiz-run?quiz=ID — authenticated current question, never the answer key before locking.
- POST /api/quiz-start — start/resume a run.
- POST /api/quiz-answer — lock an answer for the expected run ID/index.
- POST /api/quiz-next — advance or finish and award.
- GET /api/host/quizzes — host-only drafts and published configurations.
- POST /api/host/quiz-save — host-only import, cover, title, and publication.

Answers are validated against the server's saved alternatives; client-reported scores have no effect. Economic mutations use existing session, origin, burst and idempotency protections. Media is loaded by the browser over HTTPS; no video player is created.

Host form submissions read their actual HTML ID attribute, so the hidden quiz ID cannot shadow the submit route. A frontend regression test executes the bundled host console and submits this exact form shape; Worker tests cover filename-based imports, private drafts and empty-pool rejection.

If AMQ blocks requests from Cloudflare, imports use the bundled compact title/song index (same AMQ master-list version). Both live and fallback data are cached for 24 hours. Refresh the fallback from a machine with access using `node tools/refresh-quiz-answers.mjs`, then deploy the updated asset. Only names and song IDs are retained; songs and videos are not copied. If both sources fail, no pool is changed. Host save responses include the answer-source mode and version for diagnostics.
