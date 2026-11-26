# AMQ Tours Play

Play uses the existing Gacha login. 1v1 Ranked, Song/Artist, 1-Team, NGMC,
and Hot Potato offer matchmaking and custom lobbies. 1v1 custom lobbies are
unranked and support Random and Watched.
The original Quiz tab still uses its existing quiz transport and rewards.

Multiplayer song selection excludes recordings marked as Dub in both Random and Watched pools.

Players share a movable Match Chat window. Signed-in spectators of public matches
see the regular match layout, hear the active song, and can use chat through the
results screen. Chat uses the sender's display name in the spectator view. The
spectator connection receives the current sealed clip when guessing opens. Chat announces
when spectators start or stop watching and when players leave. Custom lobbies
have a separate Lobby Chat for members between matches. Each chat restores up
to 80 messages on reconnect. Three emoji shortcuts start as 🔥, 🌋 and ❓ and
can be customized for the account in that browser.

Anime suggestions use AMQ-style contiguous matching and shortest-title order.
Fuzzy Search uses AMQ Autocomplete Improvement 1.41 for anime titles. It shows up to 25 suggestions. As you type, it rechecks previous matches and orders matching phrases ahead of reordered word fragments. Fresh searches also prioritize prefixes. Typo matching runs when these searches find no titles. The setting is remembered in the
browser for Play and Quiz. Both use the same accepted answers for scoring.
Autolock uses the first anime suggestion on Enter and at timeout. A highlighted
suggestion takes priority. Multiplayer saves timeout choices privately before
the deadline. In voting modes, those choices become proposals at timeout for
fields the player has not already submitted, and existing votes still count.

Any player can request a match abort. The request counts as a yes vote. More
than half the starting roster must vote yes to void the result immediately.
During guessing, a separate Skip Song vote reveals the current song when a
majority of active players agree. Autoskip counts the player as ready to
reveal alongside submitted answers or completed ballots. Each active player
must be ready for this path to reveal the song. Submitted answers are scored.

Matchmaking credits require a match that reaches its gameplay finish. Players
who leave or are still disconnected at the finish earn no credits. Missing
songs does not affect the payout. Three consecutive completed matchmaking
matches with zero answers each trigger a 24-hour lock across matchmaking pools.
An incorrect answer, Arena title submission, or Arena vote breaks the streak.
Cancelled matches, early forfeits, and custom lobbies do not count toward the
streak. Ranked leave penalties continue to apply under the existing rules.

Matchmaking winners earn the base reward and losers earn half. Draws pay the base
reward to each finisher. The base is 400 for ranked NGMC 4v4, 200 for NGMC 3v3
and Song/Artist 3v3, and 100 for ranked 1v1 and Song/Artist 1v1. Arena uses
100 per completed round and final standings. Cooperative Song/Artist 1-Team
pays 200 per finisher.

Overview is the Play landing tab. Quick Join uses the selected Random or Watched
pool and keeps the current queue active while browsing. The page lists current
matches, with hover, focus, and tap controls for lineups in unlocked rooms.
Signed-in players can see and search the online roster. Guests can see counts.

Play Rankings includes NGMC Ranked, Song/Artist 1v1, Song/Artist 3v3 and Quiz.
Each column sorts the full leaderboard. Rank preserves a player's position in
the default standings. Quiz average time uses timed personal bests on published
quizzes, one per player and quiz.

## 1-Team

- The dedicated tab has separate Random and Watched survival queues and keeps
  the existing three-player Song/Artist 1-Team queue and its custom lobbies.
- Survival queues start at least three and up to eight players 20 seconds
  after the newest eligible player joins. Watched uses the combined list pool.
- Up to 100 verified songs, 20 seconds per song, and five shared lives. Players
  submit titles or vote for submitted titles to mark themselves ready for the
  reveal. The leading guess is graded at timeout or when everyone has responded,
  and tied choices are picked randomly. An incorrect or missing team guess costs
  one life. The match ends after the final reveal or the fifth miss.
- Players who finish a match earn 5 credits per song played in Random or 2 in
  Watched, including completed rematches. Survival is unranked.
  The existing Song/Artist queue retains its rewards.
- When a completed match ends, the remaining players have 90 seconds to vote
  on a restart. A majority opens a two-minute invitation to the same 1-Team
  format and pool for the players and current spectators. Invitees opt in and
  ready up in the shared lobby before the host starts.

## Song / Artist

- Separate queues: 1v1 (2 people), 3v3 (6 people), and cooperative Song/Artist
  1-Team (3 people, in its own tab).
  Cooperative 1-Team shows individual contributions and grants no Rating or
  ranked ready-timeout penalties.
- Queues match in arrival order; teams are randomly assigned. One active match
  per account.
- Each match selects 20 distinct recordings with verified MP3 audio. All players
  receive the same order. Song/Artist, NGMC and new Quiz imports use the master
  sheet, published Gacha quizzes, AMQ+, then the official AMQ song list. The
  sheet's most complete export supplies the accepted anime titles for a recording.
  Published quiz changes refresh the Play pool on the next catalogue check.
  Metadata-only entries can supply names and IDs until a playable source is available.
- 30 seconds per song. The answer reveal lasts three seconds before the next
  song can start. In 1v1, everyone submitting early reveals early. Team-field owners
  may cancel their submission and claim a field again until time expires. The server grades answers.
- Each correct anime, song and artist gives one point. Teams can earn at most
  3 points per song / 60 per match. Each player also earns their own correct
  contribution count. In 3v3/1-Team, each player owns at most one field per song:
  the first explicit submission claims it; cancel submission releases it to
  teammates until the 30-second deadline. Anime/song edits require cancellation;
  the artist owner can still add/remove individual members. Claims
  reset for the next song. 1v1 still lets each player answer all three fields.
- Team modes show three shared answer rows and their owners beneath the countdown
  bar. 1-Team players can react to teammates’ answers with O, X, triangle or ?.
  Reactions reset each song and do not affect scoring. Opponents'
  answers remain private until reveal. Submitted 1v1 answers require explicit cancellation to edit. Drafts
  already received at the deadline are scored; client timestamps are not trusted.
- All players must download the encrypted first batch, which includes up to three songs
  and the unassigned decoys, and enable audio before starting. Remaining clips download in
  two concurrent streams in the background. Players missing the next batch wait together before
  its countdown. Initial readiness expires
  after 3 minutes; later buffering after 90 seconds. A reconnect does not extend
  a running song's clock. Leaving forfeits future contributions; teammates continue.
- Encrypted downloads stay in memory and are released on leaving. The browser
  creates a playable blob only after the current round's key arrives. EU/NAE/NAW
  selects the server's source mirror. A failed mirror can fall back to the
  verified source, and unresolved errors keep the shared readiness gate closed.

## NGMC Ranked

- Eight-player arrival queue; enumerate all 35 distinct 4v4 partitions and use
  the smallest total Elo difference. All players begin at 1,000 NGMC Elo.
- Two teams start with five lives. Each song permits one correct eligible player
  per team to spend one guess. One eligible team takes a life; both eligible
  teams spend a guess without damage; neither eligible team changes lives.
  Correct answers from players with zero guesses cannot attack or block.
- When only one team can spend a guess and the opponent has one life left, the
  lowest-rated eligible player spends a guess immediately. The final song reveal
  begins as soon as the life is taken.
- Per-team guesses refill once all four reach zero. Initial allowances by GR:
  <8% = 1, 8–<19% = 2, 19–<28% = 3, 28–<40% = 4, >=40% = 5.
- Seed GR once from the canonical account ID's Usual tour correct/encounter
  totals at the public Tour profile endpoint. No history means three guesses.
  After an NGMC match, use cumulative NGMC hits/songs exclusively. A temporary
  Tour lookup failure prevents joining instead of silently inventing a seed.
- The counter selection pop-up opens during the 40-second signup window.
  Players can volunteer, choose Auto-Count, or dismiss the prompt and reopen it
  with Choose Counter in the match header. If both counters volunteer, play can
  start as soon as everyone is ready. Signup stays open for 40 seconds after
  match preparation finishes, then teams without a volunteer use Auto-Count. A team can also
  choose automatic counting early. When the server activates Auto-Count, the
  prompt becomes a compact takeover notice until a teammate volunteers or the
  player dismisses it. The match header also offers Take Over Counting. A choice already made for the current song stays in effect.
  A counter has eight seconds after reveal to choose an eligible teammate.
  Choices follow the team's tier order, highest rating first. On timeout, the
  lowest starting Elo is used, then canonical ID as a tie-break.
- 35 distinct recordings, sampled uniformly by anime, then available OP/ED/IN
  category, then song. Three songs and the unassigned decoys download before start. Remaining tracks
  download in the background. NGMC uses a shared 20-second answer clock and countdown bar. Only each
  player's own draft is visible until reveal. Lives reaching zero ends play;
  after song 35, most lives wins and equal lives is a draw.
- Enter selects the highlighted anime and locks it. All active players locking
  ends guessing early. The completed song markers show track details and your
  submitted answer below the progress bar. Life changes play the take or lose cue
  when counting settles. Mirrored team cards show Gacha avatars, counter badges,
  guesses remaining, and each submitted answer at reveal. Download counts stay
  hidden; a missing next track pauses everyone before the shared countdown.
- While the room shows “Selecting songs for your match…”, the server reads song
  metadata in batches of four shards and checks up to six MP3s concurrently.
  Range checks verify actual audio before the room opens. A slow mirror does
  not pause the other check slots, and completion speed never reorders the draw.
  Checks cache successes for one hour and failures for one minute. A regional
  download failure still shows retry and holds the shared readiness gate.
- During match setup, players see separate percentages for catalog shards read
  and playable songs verified. The queue badge also shows this progress across
  Play tabs. The loading screen distinguishes personal downloads, players who
  pressed Ready, and players whose audio is ready for the round.
- A room sends full round history on connection and at the end of a match.
  Browsers that support incremental updates retain earlier reveals locally.
  The latest reveal is sent again when counting updates lives or spent guesses.
- Ranked 4v4 uses Balanced Rating, starting at 1,000 in each of Random and Watched.
  Each player is compared against all seven other players using their match-start ratings.
  For each pair, W counts songs only the first player hit, L counts songs only the second hit,
  and E is the first player's expected win probability on a 400-point Elo scale.
  The first player receives `(48/7) * (W - (W+L)*E) / max(8, W+L)` points,
  and the second receives the opposite change. A match can move a player at most
  48 points. A ranked forfeit keeps the existing 25-point loss.
- `ngmc_players` and durable `ngmc_results` receipts live in the queue actor,
  separate from all tour ratings and wallets. Completion transactionally records
  Elo/GR once per match. Completion releases queue reservations before calculating
  ratings. The room checkpoints ratings and wallet receipts independently and retries
  unfinished work by alarm, including after players leave the results screen.
  Partial played history also settles when a later buffering failure cancels a
  match. Leaving keeps a ranked queue reservation until match completion;
  a fully departed team forfeits. Unplayed cancelled rooms do not affect ratings.
- Lives, spent guesses, resets, counters and final Elo deltas are server-owned.
  Play checks queue and room connections every 20 seconds. It reconnects silent
  sockets and requests a full snapshot when a phase appears overdue. An overdue
  room with a missing alarm resumes from its persisted phase and deadline.
  Song selection has a three-minute deadline from the queue reservation. If it
  expires, the players can start again. A late selection cannot open the room.
  Browser download progress is coalesced and deduplicated so 35 preloads do not
  exhaust the socket's gameplay message allowance.

## Shared Presentation

- Song List opens a dialog in every multiplayer mode. NGMC shows how many players
  answered each song correctly and the viewer’s result. Only revealed tracks are
  included while playing; the complete selection is available after the match
  finishes or is cancelled. Existing Quiz song-list dialogs remain available.
- Submit locks an answer; pressing the button again cancels it while guessing
  remains open. An all-locked early reveal closes cancellation immediately.
  Unlocks are recorded in host review; NGMC re-lock times use the new server receipt.
- The prominent ready panel precedes the roster. Inputs stay hidden until all
  players are ready; buffering hides them again. Volume shares Quiz's saved setting.
- Song/Artist uses solo scorecards for 1v1 and mirrored team panels for 3v3.
  Opponent submission status is public during guessing, answers only at reveal.
  Results compare both sides per song with expandable answers and coloured scores.
- Quiz/Play suggestions match words in either order without requiring commas,
  and prefer exact/complete-word matches, then contiguous text fragments, word prefixes and substrings;
  shortest names come first within each relevance tier. All artist-map individuals and aliases
  remain in the catalogue, including group members.
- Matchmaking text is centered. Play and Quiz use the approved thin white audio
  loader, with actual progress when known and a preparation animation otherwise.
  Reduced-motion preferences disable the animation.
- Already-running team matches without the persisted `teamFields` flag keep their
  prior answer protocol until they finish, avoiding a mid-match rules change.
- Tab/Shift+Tab cycles available Anime, Song and Artist inputs. 1-Team remembers
  the chosen category between songs and visits, falling back if a teammate owns it.
- Current text is saved privately while typing (coalesced at 250ms), including
  the last typed artist alongside added chips. At reveal/timeout the server scores
  its last received draft, without a deadline network round trip. Explicit claims
  win; competing team drafts for an unclaimed field resolve by first draft receipt
  for that category, then player ID. One field/player and exact group membership
  remain enforced. Cancelling clears the saved submission until further editing.
- 1-Team Skip Song requires two distinct active players. Votes can be cancelled;
  the second vote reveals and scores current answers, then continues normally.
- New rooms choose a random sample per song on the server. The server strips MP3
  metadata and clips audio frames for the 20- or 30-second guess window. Short
  sources use their available audio. Existing rooms keep their original sample
  behavior. New rooms require protocol 4.
- Team reveal colours and submitted text reflect the whole team; personal
  contributions remain separate. Artist names in reveals support hover/focus/tap
  credit popovers with individual group members when the AMQ library provides them.
  Full-title recognition tolerates punctuation/spacing and accent differences,
  with explicit protection against blank answers matching symbolic titles.

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
Artist suggestions include AMQ's artist directory and AMQ+ performer names and
aliases from nested member credits. The seed build writes a flat name list to
`public/quiz-library/artist-names.json`. Later masterlist refreshes retain new
performer names in refreshed song shards for the next Play catalogue build.
Tokens can be typed in any order, including comma-separated names. Arrow keys
choose an option; Enter selects the highlighted option (first by default).
The lists expose no per-match answer mapping. Public media URLs/metadata still
make song identification possible to a determined client; this is not a claim
that client-side preloading prevents cheating.

## Runtime and Operations

Audio server selection persists in the browser using the same EU/NAE/NAW
preference as Quiz. Artist answers can be submitted one name at a time, with
removable chips until the deadline (or final lock in 1v1). A group name is
accepted directly, or its exact complete membership can be submitted using
known aliases. Missing or additional members fail. Individual names containing
commas remain one entry. Submitted team fields stay yellow until reveal, then
turn green/red. Group membership must exist in the masterlist metadata.

Song/Artist uses three answer tiles with mirrored 1v1/3v3 scoreboards and
fixed-size reaction buttons with separate counts below. NGMC displays locked
answers as `Locked (x.xxxs)`, measured from the shared song start to server
receipt of the first lock. Retries preserve that duration; the next song clears
it. This display does not alter scoring or Elo.

In 3v3 and 1-Team, shared Anime/Song/Artist tiles display submitted team answers
above a separate personal answer bar. Players choose a category in the lower
bar before claiming it; their first submission keeps the bar on that category
for the song. Teammates' answers never replace the user's private input text.
Artist chips and owner-only removal controls remain in the shared Artist tile,
along with 1-Team reactions. Pending answers are yellow, then green/red at
reveal. The lower input retains autocomplete, Enter submission and owner edits.
1v1 and NGMC retain their existing input layout.

First-time NGMC rating lookup coalesces repeated requests, retries transient
Tour API failures once with a 30-second timeout per attempt, and displays a
cancellable loading state. A failed lookup never invents a guess rate.
WebSocket cleanup normalizes reserved received close codes before replying.

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

## Multiplayer Integrity Review

New NGMC and Song/Artist matches retain a host-only review indefinitely,
available under Gacha Host Console → Match Review. Hosts can search
player names/IDs or a match ID, select a player, and page through server receipt
times, submissions/drafts/artist edits, rejected or ignored submissions, scored
round outcomes, connection changes and game phases. Browser visibility/focus,
page lifecycle and client timestamps are explicitly client-reported, untrusted
observations. No other-tab URLs, clipboard, screenshots or device contents are
collected. Solo Gacha Quiz is unchanged.

Open **Match Review** in either the Play Host Console or the Gacha Host Console.
**Flagged matches only** filters the match list. Each review opens on **Highlights**.
**View log** opens the full log at the corresponding submission or scoring event.
**Timeline** shows a line for each player in the selected song. Green marks reported focus, red marks reported loss of focus, and gray marks intervals with unknown focus status. A vertical marker shows an accepted answer at its server receipt time or a recorded automatic answer at scoring. The player filter applies to both views.

- **Correct after refocusing** pairs a browser-reported departure 2–9 seconds into a song with an absence of at least 1.5 seconds, then a manual submission within 2 seconds of returning. The system checks the player's own server-scored answer and suppresses a matching draft already seen before the return.
- **Decoy answer** records an answer matching an unused track, including accepted team-lobby proposals. Highlights and the full log show both tracks and identify hits on the decoy's assigned round when applicable. Older flags pull the played track from retained match history when available. Answers shared with a real song in the match are excluded.
- **Repeated fast correct answers** starts at the third distinct song in a match where a player manually submits a correct answer within one second. The evidence lists the qualifying song numbers.

New matches are indexed automatically after they finish. Opening Highlights also indexes the retained events for older or active matches. Each player, song and signal type appears once. Hosts decide how to interpret the evidence and can record notes and review status. These observations have no effect on scoring, ratings or account access.

The library optionally supplies up to three verified unused audio tracks. One
decoy is assigned a random round at match creation and shuffled into that round's
download batch. Up to two unassigned decoys go into the opening batch with up to
three real tracks. All candidates use fixed-length sealed tickets and equally
sized AES-GCM packets within a mode. Downloads use same-origin `/api/play-audio/`
and encrypted edge caching. Only the Worker sees the AMQ MP3 URLs. The ready
button enables audio with silence, and readiness checks whole batches. Before guessing, each active player receives the current clip's slot and
key. Every browser confirms the clip can play before the server schedules a shared
start one second ahead. The loading panel names players preparing audio. Future keys, decoy keys, and the original MP3 URLs are absent from player
responses and recaps. Decoys never become scored rounds, rating data or Song List
entries.

Explicit submissions and server-scored answers matching an unused track are
flagged for review only when that answer is not accepted anywhere in the real
match. Shared anime names/artists therefore do not generate those flags. There
are no automatic bans, credit changes or score penalties. After key release, the
now-playable audio can still be recognized through fingerprinting or a second
device. Decoy flags remain evidence for host review.

WebSocket protocol 5 adds per-song playback readiness to sealed matches. Older tabs receive
a refresh instruction before joining new matches. Existing rooms can continue
using their previous playback format. Activity uses the existing authenticated, rate-limited room
socket and does not broadcast/re-render gameplay. Event retention is capped at
4,000 events per player plus a visible limit marker, and 36,000 per room. Room
gameplay state still expires after a day; review metadata/events and the queue
match index have no time-based expiry. Legacy expiry values and scheduled review
cleanup alarms no longer remove or hide saved reviews. Review endpoints require
host authorization and are
not publicly cached. No historical activity is reconstructed or backfilled.

### Live Play activity

The expandable activity bar shows signed-in players online, players searching across all queues, and ongoing multiplayer matches. Each match shows the mode, song pool, player count, and start time. The list refreshes every 30 seconds while the page is visible. An open matchmaking connection or a Play visit in the past 90 seconds counts toward the online total. Each account counts once across tabs.

### Checking a reported NGMC settlement

Hosts can inspect the protected match review settlement view for the song outcomes, starting ratings, rating receipt, and wallet receipt. The wallet receipt records when credits actually posted. A match can finish before either receipt appears. The November 2026 delayed-settlement correction preserves the original rating receipts in its audit record, recalculates downstream starts separately by pool, and adjusts each affected balance once. For a game already underway at correction time, the queue uses the corrected starting ratings at settlement.
