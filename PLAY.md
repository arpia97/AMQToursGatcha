# AMQ Tours Play

The `/play/song-artist` mode shares the existing Gacha login. NGMC Ranked,
2v2 Arena and Speed Showdown remain placeholders until their rules are defined.
The original Quiz tab still uses its existing quiz transport and rewards.

## Song / Artist

- Separate queues: 1v1 (2 people), 3v3 (6 people), 1-Team (3 people).
- Queues match in arrival order; teams are randomly assigned. One active match
  per account. This release has no Elo, credit rewards or paid entry.
- Each match selects 20 distinct AMQ+ song groups with MP3 audio. All players
  receive the same order. Anime alternatives come from the active AMQ+ cache;
  song-name variants are merged across that song's occurrences.
- 30 seconds per song, following a shared 3-second countdown; reveal lasts
  5 seconds. Everyone locking early reveals early. The server grades answers.
- Each correct anime, song and artist gives one point. Teams can earn at most
  3 points per song / 60 per match. Each player also earns their own correct
  contribution count, even when teammates answer the same category correctly.
- Teammates see each other's live submitted drafts in the middle. Opponents'
  answers remain private until reveal. Locked answers cannot change. Drafts
  already received at the deadline are scored; client timestamps are not trusted.
- All players must download the first 10 songs and enable audio before starting.
  Remaining songs download in pairs in the background. If someone lacks the next
  song, the whole match waits before its countdown. Initial readiness expires
  after 3 minutes; later buffering after 90 seconds. A reconnect does not extend
  a running song's clock. Leaving forfeits future contributions; teammates continue.
- Downloads are in-memory blob URLs, released on leaving. EU/NAE/NAW changes the
  mirror, not the selected songs. Broken downloads show a retry; they do not
  silently start an unbuffered round.

## Answer Metadata and Search

`PlayLibrary` builds one versioned catalogue from `QuizLibraryCore`'s active
manifest. A host's existing masterlist refresh therefore updates the playable
pool and anime alternatives on the next cache version. No change to AMQ export
priority for existing quizzes.

`tools/build-play-artists.mjs [full-AMQ-library.json]` updates the compact artist
relationship snapshot from AMQ's public library. It records the masterListId in
`public/play-artists.json`. This supports alias components, equivalent group
memberships, directional single-member groups and complete comma-separated
member answers, following the user-provided MIT-licensed AMQ Voicing Mode 2.0.0
by 4Lajf (forked from Zolhungaj). Unicode names remain distinct. Nested or
unresolved group memberships are not guessed.

Autocomplete downloads independent name lists once, builds normalized indices
in a module Web Worker, debounces typing by 70ms, and renders at most 20 options.
Tokens can be typed in any order, including comma-separated names. Arrow keys
choose an option; Enter selects the highlighted option (first by default).
The lists expose no per-match answer mapping. Public media URLs/metadata still
make song identification possible to a determined client; this is not a claim
that client-side preloading prevents cheating.

## Runtime and Operations

- Original Worker / GAME identities, bindings and migration history are retained.
- Additive `v4-play-matches` creates `PlayQueue` and `PlayMatch` SQLite actors.
- `PLAY_QUEUE` named `play-queues-v1` only coordinates matchmaking. One
  `PLAY_MATCHES` actor per UUID handles that match's timers, answers and scoring.
- `/api/play-connect` authenticates the existing cookie and account lock in Game,
  requires a same-origin WebSocket upgrade, and checks queue membership before
  looking up a room. Server-only identity replaces any supplied headers.
- Hibernating WebSockets carry gameplay, so no per-answer requests or polling
  hit the shared economy. Socket identities expire within 30 minutes and are
  reauthenticated on reconnect. Rate and message size limits apply.
- Queue leases expire after 60 seconds without heartbeat. Pending initialization
  retries via alarm with a stable room ID. Room state is persisted before being
  sent; alarms and immutable locked answers prevent duplicate scoring.
- Completed/cancelled rooms and membership authorization expire after a day.
  No wallets, inventory, quiz scores or legacy records are copied or reset.
- The `play` proxy must preserve the WebSocket on a 101 response; deploy its
  small proxy change as well as the original Worker for this release.

Validation uses disposable SQLite/Workers and browser sessions only. Never use
real production accounts for invented matchmaking activity.
