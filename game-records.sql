CREATE TABLE IF NOT EXISTS games (
 id TEXT PRIMARY KEY, source TEXT NOT NULL, tour_id TEXT, revision INTEGER NOT NULL,
 document TEXT NOT NULL CHECK(json_valid(document))
);
CREATE INDEX IF NOT EXISTS games_by_tour ON games(tour_id,revision);
CREATE INDEX IF NOT EXISTS games_by_source ON games(source,id);
CREATE TABLE IF NOT EXISTS game_players (
 game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE, player_id TEXT NOT NULL,
 team_id TEXT, PRIMARY KEY(game_id,player_id)
);
CREATE INDEX IF NOT EXISTS games_by_player ON game_players(player_id,game_id);
CREATE TABLE IF NOT EXISTS game_songs (
 game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE, number INTEGER NOT NULL,
 document TEXT NOT NULL CHECK(json_valid(document)), PRIMARY KEY(game_id,number)
);
CREATE TABLE IF NOT EXISTS tour_imports (
 id TEXT PRIMARY KEY, revision INTEGER NOT NULL, next_fixture INTEGER NOT NULL DEFAULT 0,
 done INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS pending_tour_import ON tour_imports(done,retry_at,id);
CREATE TABLE IF NOT EXISTS record_cursors (source TEXT PRIMARY KEY, position TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS tours (
 id TEXT PRIMARY KEY, revision INTEGER NOT NULL, document TEXT NOT NULL CHECK(json_valid(document))
);

CREATE TRIGGER IF NOT EXISTS supported_game_source BEFORE INSERT ON games
WHEN NEW.source NOT IN ('tour','play')
BEGIN
  SELECT RAISE(ABORT,'Only official tours and multiplayer matches are archived');
END;
