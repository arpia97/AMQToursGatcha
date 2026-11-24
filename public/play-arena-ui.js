import {rigCount} from './play-rig-count.js';
import {arenaLeaders} from './play-arena-config.js';
import {playPlayerAvatar} from './play-avatar.js';

const thumbsUp = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10v11m7-16-1 5h6.2a2 2 0 0 1 2 2.4l-1.5 7a2 2 0 0 1-2 1.6H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h1.8a2 2 0 0 0 1.8-1.1L12 2a2 2 0 0 1 2 3Z"/></svg>';

export function arenaBoard(match, esc) {
  const {rounds, standings, songsPerFixture} = match.arena;
  const current = Math.min(rounds.length-1,Math.floor(match.index / songsPerFixture));
  const mine = match.players.find(p => p.id === match.me)?.team;
  const names = team => match.players.filter(p => p.team === team).map(p => esc(p.name)).join(' &amp; ');
  const pair = team => '<span class="arena-pair'+(team === mine ? ' arena-mine' : '')+'">'+
    match.players.filter(p => p.team === team).map(p => '<span class="play-player-identity">'+playPlayerAvatar(p,esc)+esc(p.name)+'</span>').join('')+'</span>';
  const fixtures=mine===undefined?rounds[current]:rounds[current].filter(f=>f.home===mine||f.away===mine);
  const final = match.phase === 'finished';
  const leaders = arenaLeaders(standings);
  const title = final ? (leaders.length > 1 ? 'Joint Winners' : 'Winner') : 'Round ' + (current + 1) + ' / ' + rounds.length;
  const fixtureLabel=({home,away,scores})=>away===mine
    ? pair(away)+'<strong>'+scores[1]+' – '+scores[0]+'</strong>'+pair(home)
    : pair(home)+'<strong>'+scores[0]+' – '+scores[1]+'</strong>'+pair(away);
  const headline=final?'<h2 class="arena-winners">'+leaders.map(row=>pair(row.team)).join('')+'</h2>':
    fixtures.length===1?'<h2 class="arena-fixture-headline">'+fixtureLabel(fixtures[0])+'</h2>':
      fixtures.map(fixture=>'<div class="arena-fixture-headline">'+fixtureLabel(fixture)+'</div>').join('');
  const roster = team => match.players.filter(p => p.team === team).map(p => esc(p.name)+(p.rigs!=null?' ('+rigCount(p)+')':'')).join(' &amp; ');
  const table = '<div class="arena-table-scroll"><table><thead><tr><th>Pair</th><th>W–L–T</th><th>Diff</th><th>Pts</th></tr></thead><tbody>' +
    standings.map(row => '<tr' + (row.team === mine ? ' class="arena-mine"' : '') + '><th scope="row">' + roster(row.team) + '</th><td>' +
      [row.won,row.lost,row.drawn].join('–') + '</td><td>' + (row.difference > 0 ? '+' : '') + row.difference + '</td><td>' + row.points + '</td></tr>').join('') +
    '</tbody></table></div>';
  const schedule = rounds.map((fixtures, i) => '<section><h4>Round ' + (i + 1) + '</h4>' + fixtures.map(f =>
    '<div class="arena-pairing"><span>' + names(f.home) + '</span><b>' + (f.complete || i === current ? f.scores.join(' – ') + (f.forfeits?.length ? ' (forfeit)' : '') : 'vs') +
    '</b><span>' + names(f.away) + '</span></div>').join('') + '</section>').join('');
  return '<section class="arena-board"><header><span class="sa-eyebrow">' + title + (!final && match.phase !== 'cancelled' ? ' · Song ' + (match.index % songsPerFixture + 1) + ' / ' + songsPerFixture : '') + '</span>' + headline + '</header>' +
    '<h3>Standings</h3>' + table + '<details><summary>Round Schedule</summary>' + schedule + '</details></section>';
}

export function arenaBallot(match, esc, canVote) {
  const ballot = match.arena.ballot;
  const ordered = [...ballot].sort((a, b) => Number(b.owner === match.me) - Number(a.owner === match.me));
  const options = ordered.map(option => {
    const mine = option.owner === match.me;
    const name = mine ? 'You' : esc(match.players.find(player => player.id === option.owner).name);
    const title = option.answer ? esc(option.answer) : 'No title submitted';
    const vote = option.choice ? '<button class="button secondary arena-vote" type="button" data-ballot="anime" data-choice="' +
      esc(option.choice) + '" aria-pressed="' + option.selected + '" aria-label="Vote for ' + title + '"' +
      (canVote ? '' : ' disabled') + '>' + thumbsUp + '</button>' : '';
    return '<div class="arena-option" data-selected="' + option.selected + '"><div><small>' + name +
      '</small><strong>' + title + '</strong></div>' + (option.choice ? '<span class="arena-vote-count">' +
      option.votes + (option.votes === 1 ? ' vote' : ' votes') + '</span>' : '') + vote + '</div>';
  }).join('');
  return '<section class="arena-ballot" aria-label="Pair vote"><h3>Pair Vote</h3>' + options + '</section>';
}

export function arenaReveal(match, round, esc) {
  const mine = match.players.find(p => p.id === match.me).team;
  const fixtures = match.arena.rounds[Math.floor(round.index / match.arena.songsPerFixture)];
  const {home, away} = fixtures.find(fixture => fixture.home === mine || fixture.away === mine);
  const opposite = home === mine ? away : home;
  const choices = [[mine, 'Your Pair'], [opposite, 'Opponents']].map(([team, label]) => {
    const result = round.results.find(entry => entry.answers.anime && match.players.find(p => p.id === entry.id)?.team === team);
    const answer = result?.answers.anime;
    const status = !answer ? 'No Answer' : result.correct.anime ? 'Correct' : 'Incorrect';
    return '<div class="arena-submitted-title"><small>' + label + '</small><strong>' + esc(answer || '—') +
      '</strong><span data-result="' + status + '">' + status + '</span></div>';
  });
  return '<section class="arena-ballot" aria-label="Submitted titles"><h3>Submitted Titles</h3><div class="arena-reveal-grid">' +
    choices.join('') + '</div></section>';
}
