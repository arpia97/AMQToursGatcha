import {ARENA_FORMAT, arenaLeaders, arenaRules} from '../public/play-arena-config.js';
import {DUEL_FORMAT} from '../public/play-mode-rules.js';
import {arenaStandings} from './play-arena.js';
import {matchRecords} from './play-records.js';

const rewards = Object.freeze({
  [DUEL_FORMAT]: [100, 'Ranked 1v1'],
  'ngmc-ranked': [400, '4v4 Ranked'],
  'ngmc-3v3': [200, '3v3 Unranked'],
  [ARENA_FORMAT]: [100, '2v2 Round Robin'],
  '1v1': [100, '1v1 Song/Artist'],
  '3v3': [200, '3v3 Song/Artist'],
  '1-team': [200, 'Song/Artist 1-Team'],
});

export function matchCreditPlan(state) {
  if (state.phase !== 'finished' || !state.completed || state.lobby || !Object.hasOwn(rewards, state.format)) return null;

  // Use the existing ranked outcomes and Arena standings for the bonus.
  const winners = new Set(matchRecords(state).filter(row => row.outcome === 'W').map(row => row.id));
  const winningTeams = state.arena
    ? arenaLeaders(arenaStandings(state.arena)).map(row => row.team)
    : [];
  const unrankedNgmc = state.format === 'ngmc-3v3';
  const [first, second] = state.teams;
  if (unrankedNgmc && first !== second) winningTeams.push(first > second ? 0 : 1);

  return state.players
    .filter(player => !player.left && player.disconnectedAt == null && player.rankedLeftAt == null)
    .map(player => ({id:player.id, winner:winners.has(player.id) || winningTeams.includes(player.team)}));
}

export function awardMatchCredits(engine, match, format, players, completedRounds) {
  if (!Object.hasOwn(rewards, format)) throw Error('Invalid matchmaking reward format.');
  const [rate, label] = rewards[format];
  // Preserve the receipt identity across rate changes and rolling deployments.
  return engine.mutate('play:match-credits', match, {format, players}, () => {
    const arena = format === ARENA_FORMAT;
    // Older match workers submit the result without a round count.
    const rounds = arena ? completedRounds ?? 2 : 1;
    if (!Number.isInteger(rounds) || rounds < 0 || rounds >= arenaRules.maxPlayers / 2)
      throw Error('Invalid Arena round count.');
    if (rounds === 0) return [];
    const base = rate * rounds;
    const roundLabel = arena ? ' · ' + rounds + (rounds === 1 ? ' round' : ' rounds') : '';
    const awards = [];
    for (const {id, winner} of players) {
      if (!engine.one('SELECT 1 FROM players WHERE id=?', id)) continue;
      const bonus = winner ? base / 10 : 0;
      const amount = base + bonus;
      const awarded = engine.wallet(id, amount, 'Play match: ' + label + roundLabel + (bonus ? ' · Win bonus included' : ''), true);
      if (awarded !== false) awards.push({id, amount, bonus});
    }
    return awards;
  });
}
