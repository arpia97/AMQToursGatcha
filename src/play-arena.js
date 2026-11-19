import {arenaRules} from '../public/play-arena-config.js';

export function arenaBatch(waiters, now) {
  const count = Math.min(arenaRules.maxPlayers, waiters.length);
  if (count < 4) return {size: 0};
  if (count === arenaRules.maxPlayers) return {size: count};
  const preferred = count >= arenaRules.preferredPlayers;
  const deadline = preferred
    ? waiters[arenaRules.preferredPlayers - 1].joined + arenaRules.gatherMs
    : waiters[3].joined + arenaRules.smallFieldWaitMs;
  return now >= deadline ? {size: count - count % 4} : {size: 0, deadline};
}

export function arenaSongCount(playerCount) {
  if (!Number.isInteger(playerCount) || playerCount < 4 || playerCount > arenaRules.maxPlayers || playerCount % 4) {
    throw new RangeError('Arena requires an even number of two-player teams.');
  }
  return (playerCount / 2 - 1) * arenaRules.songsPerFixture;
}

// Pair opposite ends of the rating order to minimize the spread of pair totals.
export function pairPlayers(roster) {
  arenaSongCount(roster.length);
  const sorted = [...roster].sort((a, b) => b.elo - a.elo);
  return sorted.map((player, i) => ({...player, team: Math.min(i, sorted.length - 1 - i)}));
}

export function arenaSchedule(teamCount) {
  arenaSongCount(teamCount * 2);
  const order = Array.from({length: teamCount}, (_, team) => team);
  const rounds = [];
  for (let i = 1; i < teamCount; i++) {
    const fixtures = [];
    for (let j = 0; j < teamCount / 2; j++) {
      fixtures.push({home: order[j], away: order[teamCount - 1 - j], scores: [0, 0]});
    }
    rounds.push(fixtures);
    order.splice(1, 0, order.pop());
  }
  return {rounds, songsPerFixture: arenaRules.songsPerFixture};
}

export function recordArenaSong(arena, index, points, players) {
  const round = Math.floor(index / arena.songsPerFixture);
  for (const fixture of arena.rounds[round]) {
    fixture.scores[0] += points[fixture.home];
    fixture.scores[1] += points[fixture.away];
    fixture.complete = (index + 1) % arena.songsPerFixture === 0;
    if (fixture.complete) {
      fixture.forfeits = [fixture.home, fixture.away].filter(team =>
        players.every(player => player.team !== team || player.left));
    }
  }
}

export function arenaStandings(arena) {
  const rows = Array.from({length: arena.rounds[0].length * 2}, (_, team) =>
    ({team, won: 0, drawn: 0, lost: 0, points: 0, difference: 0}));
  for (const round of arena.rounds) for (const {home, away, scores: [a, b], complete, forfeits = []} of round) {
    if (!complete) continue;
    for (const [team, margin] of [[home, a-b], [away, b-a]]) {
      const row = rows[team];
      row.difference += margin;
      if (forfeits.includes(team)) { row.lost++; continue; }
      if (forfeits.length || margin > 0) { row.won++; row.points += 3; }
      else if (margin === 0) { row.drawn++; row.points++; }
      else row.lost++;
    }
  }
  return rows.sort((a, b) => b.points - a.points || b.difference - a.difference || a.team - b.team);
}
