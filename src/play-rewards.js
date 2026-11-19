import {ARENA_FORMAT, arenaLeaders} from '../public/play-arena-config.js';
import {DUEL_FORMAT} from '../public/play-mode-rules.js';
import {arenaStandings} from './play-arena.js';
import {matchRecords} from './play-records.js';

const rewards = Object.freeze({
  [DUEL_FORMAT]: [100, 'Ranked 1v1'],
  'ngmc-ranked': [300, '4v4 Ranked'],
  'ngmc-3v3': [100, '3v3 Unranked'],
  [ARENA_FORMAT]: [200, '2v2 Round Robin'],
  '1v1': [100, '1v1 Song/Artist'],
  '3v3': [200, '3v3 Song/Artist'],
  '1-team': [200, 'Song/Artist 1-Team'],
});

export function matchCreditPlan(state) {
  if (state.phase !== 'finished' || state.lobby || !Object.hasOwn(rewards, state.format)) return null;

  // Ranked matches already record forfeits and ties in their official results.
  const winners = new Set(matchRecords(state).filter(row => row.outcome === 'W').map(row => row.id));
  const winningTeams = state.arena
    ? arenaLeaders(arenaStandings(state.arena)).map(row => row.team)
    : [];
  const unrankedNgmc = state.format === 'ngmc-3v3';
  const [first, second] = state.teams;
  if (unrankedNgmc && first !== second) winningTeams.push(first > second ? 0 : 1);

  return state.players
    .filter(player => !player.left && player.rankedLeftAt == null)
    .map(player => ({id:player.id, winner:winners.has(player.id) || winningTeams.includes(player.team)}));
}

export function awardMatchCredits(engine, match, format, players) {
  if (!Object.hasOwn(rewards, format)) throw Error('Invalid matchmaking reward format.');
  const [base, label] = rewards[format];
  return engine.mutate('play:match-credits', match, {format, players}, () => {
    const awards = [];
    for (const {id, winner} of players) {
      if (!engine.one('SELECT 1 FROM players WHERE id=?', id)) continue;
      const bonus = winner ? base / 10 : 0;
      const amount = base + bonus;
      const awarded = engine.wallet(id, amount, 'Play match: ' + label + (bonus ? ' · Win bonus included' : ''), true);
      if (awarded !== false) awards.push({id, amount, bonus});
    }
    return awards;
  });
}
