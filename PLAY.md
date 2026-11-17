# AMQ Tours Play

The `/play/song-artist` and `/play/ngmc-ranked` modes share the existing Gacha
login. 2v2 Arena and Speed Showdown remain placeholders.
The original Quiz tab still uses its existing quiz transport and rewards.

## Song / Artist

- Separate queues: 1v1 (2 people), 3v3 (6 people), 1-Team (3 people).
- Queues match in arrival order; teams are randomly assigned. One active match
  per account. This release has no Elo, credit rewards or paid entry.
- Each match selects 20 distinct AMQ+ song groups with MP3 audio. All players
  receive the same order. Anime alternatives come from the active AMQ+ cache;
  song-name variants are merged across that song's occurrences.
- 30 seconds per song, following a shared 3-second countdown; reveal lasts
  5 seconds. In 1v1, everyone submitting early reveals early. Team-field owners
  may revise until time expires. The server grades answers.
- Each correct anime, song and artist gives one point. Teams can earn at most
  3 points per song / 60 per match. Each player also earns their own correct
  contribution count. In 3v3/1-Team, each player owns at most one field per song:
  the first explicit submission claims it, only its owner may revise it until
  the 30-second deadline, and no other teammate can submit that field. Claims
  reset for the next song. 1v1 still lets each player answer all three fields.
- Team modes show three shared answer rows and their owners beneath the countdown
  bar. 1-Team players can react to teammates’ answers with O, X, triangle or ?.
  Reactions reset each song and do not affect scoring. Opponents'
  answers remain private until reveal. Locked 1v1 answers cannot change. Drafts
  already received at the deadline are scored; client timestamps are not trusted.
- All players must download the first 10 songs and enable audio before starting.
  Remaining songs download in pairs in the background. If someone lacks the next
  song, the whole match waits before its countdown. Initial readiness expires
  after 3 minutes; later buffering after 90 seconds. A reconnect does not extend
  a running song's clock. Leaving forfeits future contributions; teammates continue.
- Downloads are in-memory blob URLs, released on leaving. EU/NAE/NAW changes the
  mirror, not the selected songs. Broken downloads show a retry; they do not
  silently start an unbuffered round.

## NGMC Ranked

- Eight-player arrival queue; enumerate all 35 distinct 4v4 partitions and use
  the smallest total Elo difference. All players begin at 1,000 NGMC Elo.
- Two teams start with five lives. Each song permits one correct eligible player
  per team to spend one guess. One eligible team takes a life; both eligible
  teams spend a guess without damage; neither eligible team changes lives.
  Correct answers from players with zero guesses cannot attack or block.
- Per-team guesses refill once all four reach zero. Initial allowances by GR:
  <8% = 1, 8–<19% = 2, 19–<28% = 3, 28–<40% = 4, >=40% = 5.
- Seed GR once from the canonical account ID's Usual tour correct/encounter
  totals at the public Tour profile endpoint. No history means three guesses.
  After an NGMC match, use cumulative NGMC hits/songs exclusively. A temporary
  Tour lookup failure prevents joining instead of silently inventing a seed.
- Each team may volunteer a counter during the initial two-minute window. Both
  counters plus audio readiness can start early. Missing counters use automatic
  counting. A counter has eight seconds after reveal to choose an eligible
  teammate; timeout uses lowest starting Elo, then canonical ID as a tie-break.
- 35 distinct recordings, sampled uniformly by anime, then available OP/ED/IN
  category, then song. First 12 download before start, remaining tracks download
  in pairs. NGMC uses a shared 20-second answer clock and countdown bar. Only each
  player's own draft is visible until reveal. Lives reaching zero ends play;
  after song 35, most lives wins and equal lives is a draw.
- Enter selects the highlighted anime and locks it. All active players locking
  ends guessing early. Mirrored team cards show Gacha avatars, counter badges,
  guesses remaining, and each submitted answer at reveal. Download counts stay
  hidden; a missing next track pauses everyone before the shared countdown.
- Before issuing the NGMC manifest, validate MP3 links with bounded HEAD/range
  requests and replace detected failures using the same hierarchical sampler.
  Checks cache successes for 24 hours and failures for one minute. A regional
  download failure still shows retry and holds the shared readiness gate.
- Elo follows the provided `elo.py` per-song correct-versus-incorrect pairwise
  TrueSkill calculation, **INDIVIDUAL_PERFORMANCE=False**. Internal mu 20 is
  displayed as 1,000 (scale 50); global sigma .25, beta .125, tau .0025,
  draw probability .8. The configured environment is explicitly supplied to
  rate_1vs1, repairing the Python free-function call's implicit-default issue.
  All pair deltas use the song's starting ratings, then apply simultaneously.
  All-correct/all-miss songs do not affect ratings. Match victory itself adds
  no separate rating bonus, consistent with the supplied script.
- `ngmc_players` and durable `ngmc_results` receipts live in the queue actor,
  separate from all tour ratings and wallets. Completion transactionally records
  Elo/GR once per match. Failed settlement retries by alarm before room deletion.
  Partial played history also settles when a later buffering failure cancels a
  match. Leaving keeps a ranked queue reservation until match completion;
  a fully departed team forfeits. Unplayed cancelled rooms do not affect ratings.
- Lives, spent guesses, resets, counters and final Elo deltas are server-owned.
  Browser download progress is coalesced and deduplicated so 35 preloads do not
  exhaust the socket's gameplay message allowance.

## Shared Presentation

- Song List opens a dialog in every multiplayer mode. Only revealed tracks are
  included while playing; the complete selection is available after the match
  finishes or is cancelled. Existing Quiz song-list dialogs remain available.
- Submit is the answer action; NGMC retains its immutable lock and early reveal.
- Matchmaking text is centered. Play and Quiz use the approved thin white audio
  loader, with actual progress when known and a preparation animation otherwise.
  Reduced-motion preferences disable the animation.
- Already-running team matches without the persisted `teamFields` flag keep their
  prior answer protocol until they finish, avoiding a mid-match rules change.

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
- `PLAY_QUEUE` named `play-queues-v1` coordinates matchmaking and NGMC ratings. One
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
- The existing `play` proxy preserves WebSockets on a 101 response. NGMC only
  requires the original Worker deployment; no proxy or binding change.

Validation uses disposable SQLite/Workers and browser sessions only. Never use
real production accounts for invented matchmaking activity.
