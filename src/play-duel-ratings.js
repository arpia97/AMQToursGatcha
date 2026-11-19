import {RANKED_LEAVE_COST} from '../public/ngmc-leave-policy.js';

export function duelRatings(players, history, records) {
  // A recorded ranked departure has already debited this rating pool.
  const before = players.map(player => player.elo + (player.rankedLeftAt == null ? 0 : RANKED_LEAVE_COST));
  return players.map((player,i) => {
    const forfeited = player.rankedLeftAt != null;
    const outcome = records.find(record => record.id === player.id)?.outcome;
    const actual = outcome === 'W' ? 1 : outcome === 'L' ? 0 : 0.5;
    const expected = 1 / (1 + 10 ** ((before[1-i] - before[i]) / 400));
    const delta = forfeited ? -RANKED_LEAVE_COST : 32 * (actual - expected);
    const correct = history.reduce((sum,song) => sum + (song.results.find(row => row.id === player.id)?.earned || 0),0);
    return {id:player.id,before:before[i],after:before[i]+delta,delta,correct,seen:history.length,forfeited};
  });
}
