import {animeTitleKey} from './play-artists.js';
import {arenaRules, arenaPlayerCounts} from '../public/play-arena-config.js';

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
  if (!arenaPlayerCounts.includes(playerCount)) {
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

function activeChoices(players) {
  return players.filter(player => !player.left && player.arenaTitle).map(player => player.arenaTitle);
}

export function arenaVoteAction(state, player, message) {
  const teammates = state.players.filter(member => member.team === player.team && !member.left);
  const choices = activeChoices(teammates);
  const reject = text => { throw Object.assign(Error(text), {status: 409}); };
  if (message.type === 'vote') {
    const {choice} = message;
    if (choice !== null && !choices.some(option => option.id === choice)) reject('Choose a title from your pair.');
    player.arenaVote = choice;
    if (choice !== null && player.answeredMatch === false) player.answeredMatch = true;
    return;
  }

  const answer = typeof message.answer === 'string' ? message.answer.trim() : '';
  const key = animeTitleKey(answer);
  if (!key || answer.length > 300) reject('Enter an anime title within 300 characters.');
  if (key === animeTitleKey(player.arenaTitle?.answer)) return;
  if (choices.some(option => animeTitleKey(option.answer) === key)) reject('Your partner already submitted that title. You can vote for it above.');

  const oldChoice = player.arenaTitle?.id;
  for (const member of teammates) if (member.arenaVote === oldChoice) delete member.arenaVote;
  player.arenaTitle = {id: crypto.randomUUID(), answer};
  if (player.answeredMatch === false) player.answeredMatch = true;
}

export function arenaBallotView(state, me) {
  const teammates = state.players.filter(player => player.team === me.team);
  return teammates.map(player => {
    const choice = player.left ? null : player.arenaTitle;
    return {
      owner: player.id,
      choice: choice?.id,
      answer: choice?.answer,
      votes: choice ? teammates.filter(voter => !voter.left && voter.arenaVote === choice.id).length : 0,
      selected: !!choice && me.arenaVote === choice.id,
    };
  });
}

export function arenaVotesComplete(active) {
  return active.every(player => player.autoSkip || active.some(teammate =>
    teammate.team === player.team && teammate.arenaTitle?.id && teammate.arenaTitle.id === player.arenaVote));
}

export function selectArenaTitles(state) {
  for (const player of state.players) player.answers = {};
  for (let team = 0; team < state.teams.length; team++) {
    const teammates = state.players.filter(player => player.team === team && !player.left);
    const choices = activeChoices(teammates);
    if (!choices.length) continue;
    const voteCounts = choices.map(choice => teammates.filter(player => player.arenaVote === choice.id).length);
    const highest = Math.max(...voteCounts);
    const tied = choices.filter((_, i) => voteCounts[i] === highest);
    const winner = tied[Math.floor(Math.random() * tied.length)];
    const owner = teammates.find(player => player.arenaTitle?.id === winner.id);
    owner.answers.anime = winner.answer;
  }
}
