# Statistics records

Cloudflare D1 database `amqtours-game-records` stores completed official tour fixtures and Play multiplayer matches. There is no anonymous query endpoint. The two-minute Worker job imports independently of gameplay, scoring and payments.

## Reading version 1

Read `games.document` by game ID, then attach `game_songs.document` as the `songs` array ordered by `number`. Use `game_players(player_id,game_id)` for a player's games. Identifiers are strings. Tour fixtures use `tour:<tour ID>:<fixture ID>` and multiplayer uses `play:<match ID>`. `tours.document` links an official tour, its roster and its fixtures. For an API serving official fixtures, join games to tours on both tour ID and revision, and require tour_imports.done=1. This keeps partly refreshed tours out of published results.

Each game has source, format, pool, date information, teams and players. Songs have a 1-based number, anime, title, artist, song type and per-player results. Correctness can be broken out by anime, song and artist. Absent fields or null mean the source did not retain the value. A zero is a recorded value. Official rating snapshots apply to the whole tour. Count its rating change once per player and tour. Multiplayer before/after values come from the settlement receipt when available. An unranked game may have a starting matchmaking rating without a rating change.

Official reports retain restart segment number, the source's original song number, tier order within each segment's team and lineup provenance. Fixture lineups are the fallback when the report itself lacks a segment lineup. Older Play reviews can retain per-player hits after the song titles have become unavailable. Archive-only spreadsheet summaries have no fixture JSON. Chat, focus history, flags, decoys, submitted free text, unrevealed tracks and audio addresses are outside the record format.

The archive makes idempotent writes by source ID. Revisions replace an official fixture's songs and roster together. The Host manifest is periodically rescanned for finalized, edited and withdrawn tours. Durable queues retain finished multiplayer records until D1 confirms the write. Apply the additive schema with `wrangler d1 execute amqtours-game-records --remote --file game-records.sql` before deploying a Worker that uses it.
