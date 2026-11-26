import {arenaStandings} from './play-arena.js';
import {matchRecords} from './play-records.js';
import {ONE_TEAM_FORMAT,studioTeamsMatch,freeForAllMatch} from '../public/play-mode-rules.js';

import {sharedSongFormat, teamSongResult} from '../public/play-team-song.js';

const HISTORY_META_ID = 6;
const PAGE_SIZE = 6;
const scoreOutcome = (score, opponent) => score === opponent ? 'T' : score > opponent ? 'W' : 'L';

function songResult(round, result) {
  const {index, anime, song, songType, artist} = round;
  const {earned, correct, answers} = result;
  return {index, anime, song, songType, artist, earned, correct, answers};
}

export function preservePlayHistory(storage, state, ended = Date.now()) {
  const {sql} = storage;
  if (state.phase !== 'finished' || state.aborted) return;
  if (sql.exec('SELECT 1 FROM review_meta WHERE id=?', HISTORY_META_ID).toArray().length) return;
  const outcomes = new Map(matchRecords(state).map(row => [row.id, row.outcome]));
  const placements = state.arena ? arenaStandings(state.arena).map(row => row.team) : null;
  const players = state.players.map(({id, team, score, left, elo}) => {
    let outcome = left ? 'Left' : outcomes.get(id);
    if (!outcome && state.format === ONE_TEAM_FORMAT) outcome = state.teams[0] > 0 ? 'Survived' : 'OutOfLives';
    if (!outcome && studioTeamsMatch(state) && state.teams.length===1 && state.lobby.studio.scoring==='Lives')
      outcome=state.teams[0]>0?'Survived':'OutOfLives';
    if (!outcome && state.teams.length === 2 && !placements && !freeForAllMatch(state)) {
      const other = state.teams[1 - team];
      outcome = scoreOutcome(state.teams[team], other);
    }
    const place = placements ? placements.indexOf(team) + 1 : (freeForAllMatch(state)||studioTeamsMatch(state)&&state.teams.length>2)
      ? 1 + state.teams.filter(total => total > state.teams[team]).length : undefined;
    return {id, ...(studioTeamsMatch(state)?{team}:{}), score, outcome, place, ratingBefore:elo};
  });
  const summary = {teams:state.teams,...(studioTeamsMatch(state)?{studioTeams:true}:{}),arena:state.arena?{songsPerFixture:state.arena.songsPerFixture,
    rounds:state.arena.rounds.map(fixtures=>fixtures.map(({home,away,scores,complete,forfeits})=>({home,away,scores,complete,forfeits})))}:null,pool: state.pool ?? state.lobby?.pool, ended, players, rounds: state.history.length};
  storage.transactionSync(() => {
    sql.exec('CREATE TABLE IF NOT EXISTS play_history_rounds(idx INTEGER PRIMARY KEY,data TEXT NOT NULL)');
    for (const {index, anime, song, songType, artist, results, points, lives} of state.history) {
      const row = {index, anime, song, songType, artist, points, lives,
        results: results.map(({id, earned, correct, answers}) => ({id, earned, correct, answers}))};
      sql.exec('INSERT OR REPLACE INTO play_history_rounds VALUES(?,?)', index, JSON.stringify(row));
    }
    sql.exec('INSERT INTO review_meta VALUES(?,?,0)', HISTORY_META_ID, JSON.stringify(summary));
  });
}

export function readPlayHistory(storage, state, player, includeSongs, format = state?.format) {
  if (state && state.phase !== 'finished') return null;
  const {sql} = storage;
  const load = () => sql.exec('SELECT data FROM review_meta WHERE id=?', HISTORY_META_ID).toArray()[0];
  const endedAt = () => sql.exec("SELECT at FROM review_events WHERE kind='ended' ORDER BY seq LIMIT 1").toArray()[0]?.at;
  let stored = load();
  if (!stored && state?.phase === 'finished') {
    preservePlayHistory(storage, state, endedAt());
    stored = load();
  }
  if (stored) {
    const summary=JSON.parse(stored.data);
    const {pool, ended, players, rounds}=summary;
    const studioTeams=summary.studioTeams||!!(state&&studioTeamsMatch(state));
    const roster=state?.players??players;
    const team=studioTeams?roster.find(p=>p.id===player)?.team:undefined;
    const teammates=studioTeams&&includeSongs&&team!=null?new Set(roster.filter(p=>p.team===team).map(p=>p.id)):null;
    const entry = players.find(row => row.id === player);
    if (!entry) return null;
    const songs = includeSongs ? sql.exec('SELECT data FROM play_history_rounds ORDER BY idx').toArray().flatMap(({data}) => {
      const round = JSON.parse(data);
      const result = round.results.find(row => row.id === player);
      if (!result) return [];
      if(teammates)return [{...songResult(round,result),teamResult:teamSongResult(round.results.filter(r=>teammates.has(r.id)))}];
      if (sharedSongFormat(format)) return [{...songResult(round, result), teamResult: teamSongResult(round.results)}];
      const lobbyScore = {
        correct: round.results.filter(row => row.correct?.anime === true).length,
        total: players.length,
      };
      return [{...songResult(round, result), lobbyScore}];
    }) : undefined;
    return {pool, ended, ...(studioTeams?{studioTeams:true,teamCount:summary.teams.length}:{}), score: entry.score, outcome: entry.outcome, place: entry.place,
      rounds, ...(includeSongs ? {songs} : {})};
  }
  const ended = endedAt();
  const legacy = sql.exec("SELECT data FROM review_events WHERE player=? AND kind='round-result' ORDER BY seq", player).toArray();
  if (!legacy.length) return {ended};
  const songs = legacy.map(({data}) => {
    const result = JSON.parse(data);
    return songResult({index: result.round - 1}, {...result,
      earned: result.earned ?? Object.values(result.correct ?? {}).filter(Boolean).length});
  });
  if (includeSongs && sharedSongFormat(format)) {
    const meta = sql.exec('SELECT data FROM review_meta WHERE id=1').toArray()[0];
    const roster = state?.players ?? (meta && JSON.parse(meta.data).players);
    const byRound = new Map();
    for (const row of sql.exec("SELECT player,data FROM review_events WHERE kind='round-result' ORDER BY seq")) {
      const result = JSON.parse(row.data);
      if (!byRound.has(result.round)) byRound.set(result.round, new Map());
      byRound.get(result.round).set(row.player, result);
    }
    for (const song of songs) {
      const results = byRound.get(song.index + 1);
      if (roster?.length && roster.every(p => results?.has(String(p.id)))) {
        song.teamResult = teamSongResult([...results.values()]);
      }
    }
  }
  return {ended, rounds: songs.length, score: songs.reduce((sum, song) => sum + song.earned, 0),
    ...(includeSongs ? {songs, roundsOnly: true} : {})};
}

export function playedTrackLookup(sql, history = [], rounds) {
  const tracks = new Map();
  const wanted = new Set(rounds);
  const add = ({index, anime, song, artist}) => tracks.set(index + 1, {anime, song, artist});
  for (const row of history) if (wanted.delete(row.index + 1)) add(row);
  if (wanted.size && sql.exec('SELECT 1 FROM review_meta WHERE id=?', HISTORY_META_ID).toArray().length) {
    const indices = [...wanted].map(round => round - 1);
    const rows = sql.exec(`SELECT idx AS "index", json_extract(data,'$.anime') AS anime,
      json_extract(data,'$.song') AS song, json_extract(data,'$.artist') AS artist
      FROM play_history_rounds WHERE idx IN (${indices.map(() => '?').join(',')})`, ...indices);
    for (const row of rows) add(row);
  }
  return tracks;
}

export async function playerHistory(queue, player, {before, match} = {}) {
  const participant = "m.status='finished' AND EXISTS (SELECT 1 FROM json_each(m.players) p WHERE json_extract(p.value,'$.id')=?)";
  const records = `SELECT m.id,m.created,m.format,r.outcome FROM match_reviews m
    LEFT JOIN play_records r ON r.match=m.id AND r.player=? WHERE ${participant}`;
  const detail = async (row, songs) => {
    const saved = await queue.env.PLAY_MATCHES.getByName(row.id).playerHistory(player, songs, row.format);
    if (!saved) return null;
    return {id: row.id, format: row.format, date: row.created, ...saved,
      outcome: saved.outcome ?? row.outcome};
  };
  if (match) {
    const row = queue.rows(records + ' AND m.id=?', player, player, match)[0];
    return row ? detail(row, true) : null;
  }
  const cursor = before && queue.rows(records + ' AND m.id=?', player, player, before)[0];
  if (before && !cursor) return {matches: [], next: null};
  const rows = queue.rows(records + (cursor ? ' AND (m.created,m.id)<(?,?)' : '') +
    ' ORDER BY m.created DESC,m.id DESC LIMIT ?', player, player, ...(cursor ? [cursor.created,cursor.id] : []), PAGE_SIZE + 1);
  const matches = await Promise.all(rows.slice(0, PAGE_SIZE).map(row => detail(row, false)));
  return {matches: matches.filter(Boolean), next: rows.length > PAGE_SIZE ? rows[PAGE_SIZE - 1].id : null};
}
