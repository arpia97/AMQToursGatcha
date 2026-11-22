import {ARENA_FORMAT, arenaLeaders, arenaRules} from '../public/play-arena-config.js';
import {DUEL_FORMAT,ONE_TEAM_FORMAT,oneTeamRules} from '../public/play-mode-rules.js';
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
  const survival=state.format===ONE_TEAM_FORMAT;
  if (state.phase !== 'finished' || !state.completed ||
      (!survival && (state.lobby || !Object.hasOwn(rewards, state.format)))) return null;

  const outcomes = new Map(matchRecords(state).map(row => [row.id,row.outcome]));
  const leaders = state.arena ? arenaLeaders(arenaStandings(state.arena)).map(row => row.team) : [];
  const [first,second] = state.teams;

  return state.players
    .filter(player => !player.left && player.disconnectedAt == null && player.rankedLeftAt == null)
    .map(({id,team}) => {
      let outcome = outcomes.get(id);
      if (survival || state.format === '1-team') outcome = 'cooperative';
      if (state.format === 'ngmc-3v3') outcome = first === second ? 'T' : team === (first > second ? 0 : 1) ? 'W' : 'L';
      if (state.arena) outcome = !leaders.includes(team) ? 'L' : leaders.length === 1 ? 'W' : 'T';
      // Keep the same winner flag as existing receipts, including Arena joint leaders.
      return {id,winner:outcome === 'W' || leaders.includes(team),outcome};
    });
}

export function awardMatchCredits(engine, match, format, players, completedRounds, survivalResult) {
  const survival=format===ONE_TEAM_FORMAT;
  if (!survival && !Object.hasOwn(rewards, format)) throw Error('Invalid matchmaking reward format.');
  const [rate, label] = survival
    ? [survivalResult?.pool==='watched'?2:5, '1-Team '+(survivalResult?.pool==='watched'?'Watched':'Random')]
    : rewards[format];
  if (survival && (!['random','watched'].includes(survivalResult?.pool) || !Number.isInteger(survivalResult?.songs) ||
      survivalResult.songs<1 || survivalResult.songs>oneTeamRules.songs)) throw Error('Invalid 1-Team result.');
  // Preserve the receipt identity across rate changes and rolling deployments.
  const receiptPlayers = players.map(({id,winner}) => ({id,winner}));
  return engine.mutate('play:match-credits', match, {format, players:receiptPlayers,...(survival?{survivalResult}:{})}, () => {
    const arena = format === ARENA_FORMAT;
    // Older match workers submit the result without a round count.
    const rounds = arena ? completedRounds ?? 2 : 1;
    if (!Number.isInteger(rounds) || rounds < 0 || rounds >= arenaRules.maxPlayers / 2)
      throw Error('Invalid Arena round count.');
    if (rounds === 0) return [];
    const base = rate * (survival ? survivalResult.songs : rounds);
    const roundLabel = survival
      ? ' · '+survivalResult.songs+(survivalResult.songs===1?' song':' songs')
      : arena ? ' · ' + rounds + (rounds === 1 ? ' round' : ' rounds') : '';
    const awards = [];
    for (const {id,outcome} of players) {
      if (!['W','L','T','cooperative'].includes(outcome)) throw Error('Missing matchmaking reward outcome.');
      if (!engine.one('SELECT 1 FROM players WHERE id=?', id)) continue;
      const amount = outcome === 'L' ? base / 2 : base;
      const resultLabel = {W:'Win',L:'Loss',T:'Draw',cooperative:'Completed'}[outcome];
      const awarded = engine.wallet(id, amount, 'Play match: ' + label + roundLabel + ' · ' + resultLabel, true);
      if (awarded !== false) awards.push({id, amount, bonus:0});
    }
    return awards;
  });
}
