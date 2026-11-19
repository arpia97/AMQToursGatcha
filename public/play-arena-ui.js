import {arenaRules} from './play-arena-config.js';

export function arenaQueueInfo() {
  return '<section class="sa-lobby play-queue-card"><h2>Round Robin</h2><p>Queue solo. Your rating helps balance the pairs, and your partner stays with you for the tournament.</p>' +
    '<p>Four or more pairs are preferred. Two pairs can start after ' + arenaRules.smallFieldWaitMs / 1000 + ' seconds.</p></section>';
}

export function arenaBoard(match, esc) {
  const {rounds, standings, songsPerFixture} = match.arena;
  const current = Math.floor(match.index / songsPerFixture);
  const mine = match.players.find(p => p.id === match.me).team;
  const names = team => match.players.filter(p => p.team === team).map(p => esc(p.name)).join(' &amp; ');
  const fixture = rounds[current].find(f => f.home === mine || f.away === mine);
  const ownSide = fixture.home === mine ? 0 : 1;
  const opponent = ownSide === 0 ? fixture.away : fixture.home;
  const final = match.phase === 'finished';
  const leaders = standings.filter(row => row.points === standings[0].points && row.difference === standings[0].difference);
  const title = final ? (leaders.length > 1 ? 'Joint Winners' : 'Winner') : 'Round ' + (current + 1) + ' / ' + rounds.length;
  const headline = final ? leaders.map(row => names(row.team)).join(' · ') :
    names(mine) + ' <strong>' + fixture.scores[ownSide] + ' – ' + fixture.scores[1-ownSide] + '</strong> ' + names(opponent);
  const table = '<div class="arena-table-scroll"><table><thead><tr><th>Pair</th><th>W–L–T</th><th>Diff</th><th>Pts</th></tr></thead><tbody>' +
    standings.map(row => '<tr' + (row.team === mine ? ' class="arena-mine"' : '') + '><th scope="row">' + names(row.team) + '</th><td>' +
      [row.won,row.lost,row.drawn].join('–') + '</td><td>' + (row.difference > 0 ? '+' : '') + row.difference + '</td><td>' + row.points + '</td></tr>').join('') +
    '</tbody></table></div>';
  const schedule = rounds.map((fixtures, i) => '<section><h4>Round ' + (i + 1) + '</h4>' + fixtures.map(f =>
    '<div class="arena-pairing"><span>' + names(f.home) + '</span><b>' + (f.complete || i === current ? f.scores.join(' – ') + (f.forfeits?.length ? ' (forfeit)' : '') : 'vs') +
    '</b><span>' + names(f.away) + '</span></div>').join('') + '</section>').join('');
  return '<section class="arena-board"><header><span class="sa-eyebrow">' + title + (!final && match.phase !== 'cancelled' ? ' · Song ' + (match.index % songsPerFixture + 1) + ' / ' + songsPerFixture : '') + '</span><h2>' + headline + '</h2></header>' +
    '<h3>Standings</h3>' + table + '<details><summary>Round Schedule</summary>' + schedule + '</details></section>';
}
