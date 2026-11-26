import {loadQuizTitleDisplay, quizAnimeTitle} from './quiz-title-display.js';
import {ONE_TEAM_FORMAT} from './play-mode-rules.js';

import {sharedSongFormat} from './play-team-song.js';

const formats = {
  'hot-potato':'Hot Potato · Team VS','hot-potato-team':'Hot Potato · 1-Team','lobby-hot-potato':'Hot Potato · Team VS','lobby-hot-potato-team':'Hot Potato · 1-Team','ngmc-ranked': 'NGMC 4v4 Ranked', 'ngmc-3v3': 'NGMC 3v3', 'lobby-ngmc': 'NGMC Lobby',
  '1v1-ranked': '1v1 Ranked', 'lobby-duel': '1v1 Lobby', '2v2-arena': '2v2 Arena',
  'lobby-arena': '2v2 Arena Lobby', '1v1': 'Song/Artist 1v1', '3v3': 'Song/Artist 3v3',
  '1-team': 'Song/Artist 1-Team', 'lobby-team': 'Song/Artist 1-Team Lobby', 'lobby-ffa': 'Song/Artist FFA Lobby',
  [ONE_TEAM_FORMAT]: '1-Team',
};
const outcomes = {W: 'Win', L: 'Loss', T: 'Draw', Left: 'Left', Survived:'Survived', OutOfLives:'Out of lives'};
const dateFormat = new Intl.DateTimeFormat(undefined, {month: 'short', day: 'numeric', year: 'numeric'});
const dateOf = row => dateFormat.format(row.ended ?? row.date);
const formatOf = row => row.studioTeams ? (row.teamCount===1?'Custom Lobby · 1-Team':'Custom Lobby · Teams') : formats[row.format] ?? row.format;
const labels = {anime: 'Anime', song: 'Song', artist: 'Artist'};

export function matchHistoryHTML(matches, escape) {
  return '<div class="ph-matches">' + matches.map((row, index) => {
    const result = outcomes[row.outcome] ?? (row.place ? 'Place ' + row.place : 'Finished');
    return '<article class="ph-match"><div class="ph-match-name"><strong>' + escape(formatOf(row)) +
      '</strong><small>' + escape(dateOf(row)) + '</small></div>' +
      (row.pool ? '<span class="ph-pool ' + (row.pool === 'watched' ? 'watched' : 'random') + '">' +
        (row.pool === 'watched' ? 'Watched' : 'Random') + '</span>' : '<span class="ph-pool" hidden></span>') +
      '<div class="ph-result"><span class="ph-badge ' + (row.outcome === 'W' ? 'correct' : row.outcome === 'L' ? 'miss' : '') +
      '">' + escape(result) + '</span><small>' + (row.score == null ? '' : escape(row.score) +
      ' pts' + (row.rounds == null ? '' : ' · ' + escape(row.rounds) + ' songs')) + '</small></div>' +
      '<button type="button" class="button secondary" data-history-match="' + index + '">Songs <span aria-hidden="true">›</span></button></article>';
  }).join('') + '</div>';
}

export function songHistoryHTML(data, escape, titleMode) {
  if (!data.songs?.length) return '<p class="ph-empty">No song results were recorded for this match.</p>';
  const shared = data.studioTeams || sharedSongFormat(data.format);
  const rows = data.songs.map(personal => {
    const known = !shared || !!personal.teamResult;
    const song = shared ? {...personal, earned: 0, correct: {}, answers: {}, ...personal.teamResult} : personal;
    const fields = Object.keys(labels).filter(field => Object.hasOwn(song.correct ?? {}, field));
    const correct = fields.length > 0 && song.earned === fields.length;
    const result = !known ? 'Unavailable' : fields.length <= 1 ? (correct ? (shared ? 'Hit' : 'Correct') : 'Missed') : song.earned + '/' + fields.length;
    const indicator = !known ? '—' : correct ? '✓' : song.earned ? '•' : '×';
    const credit = [song.songType, song.song, song.artist].filter(Boolean).join(' · ');
    const score = song.lobbyScore;
    const lobbyScore = shared ? '' : score
      ? '<span class="ph-lobby-score" aria-label="Lobby score: ' + escape(score.correct) + ' of ' +
        escape(score.total) + ' players answered the anime correctly">' + escape(score.correct + '/' + score.total) + '</span>'
      : '<span class="ph-lobby-score" aria-label="Lobby score unavailable">—</span>';
    const answer = fields.map(field => '<div><small>' + labels[field] + '</small><span>' +
      escape(song.answers?.[field] || 'No answer') + '</span><b class="' + (song.correct[field] ? 'correct' : 'miss') +
      '">' + (song.correct[field] ? 'Correct' : 'Missed') + '</b></div>').join('');
    return '<details class="ph-song"><summary><span class="ph-song-number">' + (song.index + 1) +
      '</span><span class="ph-track"><strong>' +
      escape(song.anime ? quizAnimeTitle(song, titleMode) : song.answers?.anime || 'Round ' + (song.index + 1)) +
      '</strong>' + (credit ? '<small>' + escape(credit) + '</small>' : '') + '</span>' + lobbyScore + '<span class="ph-badge ' +
      (!known ? '' : correct ? 'correct' : song.earned ? 'partial' : 'miss') + '"><span aria-hidden="true">' +
      indicator + '</span> ' + escape(result) + '</span><span class="ph-chevron" aria-hidden="true">›</span></summary>' +
      '<div class="ph-song-answers"><strong>' + (shared ? 'Team Answers' : 'Your Answers') + '</strong>' + (known ? answer : ' —') + '</div></details>';
  });
  return (data.roundsOnly ? '<p class="ph-archive">Track details are unavailable for this older match.</p>' : '') +
    '<div' + (shared ? ' class="ph-team-songs"' : '') + '><div class="ph-song-labels" aria-hidden="true"><span>#</span><span>Anime / Track</span>' + (shared ? '<span>Team Result</span>' : '<span title="Players who answered the anime correctly">Lobby Score</span><span>Your Result</span>') + '</div>' +
    '<div class="ph-songs">' + rows.join('') + '</div></div>';
}

export function openPlayHistory({modal, api, escape, titleMode}) {
  modal('<section class="ph-panel"><header class="ph-header"><h2>Play History</h2>' +
    '<div class="ph-tabs" role="group" aria-label="History view"><button type="button" data-history-view="matches" aria-pressed="true">Matches</button>' +
    '<button type="button" data-history-view="songs" aria-pressed="false">Songs</button></div></header>' +
    '<div class="ph-filters"></div><div class="ph-body"></div><footer class="ph-footer"></footer></section>', 'play-history-modal');
  const panel = document.querySelector('.ph-panel');
  const body = panel.querySelector('.ph-body'), filters = panel.querySelector('.ph-filters'), footer = panel.querySelector('.ph-footer');
  const details = new Map(), cursors = [null];
  let view = 'matches', page = 0, selected = 0, results, revision = 0;

  const pending = label => '<p class="ph-empty" role="status">' + label + '</p>';
  function render() {
    const hasRows = !!results?.matches.length;
    const showPicker = hasRows && view === 'songs';
    for (const tab of panel.querySelectorAll('[data-history-view]')) tab.setAttribute('aria-pressed', tab.dataset.historyView === view);
    filters.innerHTML = showPicker ? '<label>Match<select aria-label="Match" data-history-picker>' +
      results.matches.map((row, index) => '<option value="' + index + '"' + (index === selected ? ' selected' : '') +
        '>' + escape([formatOf(row), row.pool === 'watched' ? 'Watched' : row.pool === 'random' ? 'Random' : null,
          dateOf(row)].filter(Boolean).join(' · ')) + '</option>').join('') + '</select></label>' : '';
    footer.innerHTML = page || results?.next ? '<span>Page ' + (page + 1) + '</span><div>' +
      '<button type="button" class="button secondary" data-history-page="-1"' + (!page ? ' disabled' : '') + '>Newer</button>' +
      '<button type="button" class="button secondary" data-history-page="1"' + (!results?.next ? ' disabled' : '') + '>Older</button></div>' : '';
    if (!results) { body.innerHTML = pending('Loading Play history…'); return; }
    if (!hasRows) { body.innerHTML = pending('Your finished Play matches will appear here.'); return; }
    if (view === 'matches') { body.innerHTML = matchHistoryHTML(results.matches, escape); return; }
    const id = results.matches[selected].id;
    const detail = details.get(id);
    if (detail) { body.innerHTML = songHistoryHTML(detail, escape, titleMode); return; }
    body.innerHTML = pending('Loading song results…');
    const request = ++revision;
    const ready = data => {
      if (!panel.isConnected || request !== revision || view !== 'songs') return;
      body.innerHTML = songHistoryHTML(data, escape, titleMode);
    };
    api('play-history?match=' + encodeURIComponent(id)).then(data => {
      details.set(id, data);
      ready(data);
      void loadQuizTitleDisplay().then(() => {
        if (!body.querySelector('details[open]') && !body.contains(document.activeElement)) ready(data);
      });
    }).catch(error => {
      if (panel.isConnected && request === revision) showError(error, 'songs');
    });
  }

  function showError(error, retry) {
    body.innerHTML = '<p class="ph-empty" role="alert">' + escape(error.message) +
      ' <button type="button" class="button secondary" data-history-retry="' + retry + '">Retry</button></p>';
  }

  async function loadPage() {
    results = null;
    render();
    try {
      const cursor = cursors[page];
      const data = await api('play-history' + (cursor ? '?before=' + encodeURIComponent(cursor) : ''));
      if (!panel.isConnected) return;
      results = data;
      selected = 0;
      if (data.next) cursors[page + 1] = data.next;
      render();
    } catch (error) { if (panel.isConnected) showError(error, 'page'); }
  }

  panel.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    const {historyView, historyMatch, historyPage, historyRetry} = button.dataset;
    if (!historyView && historyMatch == null && !historyPage && !historyRetry) return;
    revision++;
    if (historyView) view = historyView;
    if (historyMatch != null) { selected = Number(historyMatch); view = 'songs'; }
    if (historyPage) { page += Number(historyPage); }
    if (historyPage || historyRetry === 'page') { void loadPage(); return; }
    render();
    if (historyMatch != null) panel.querySelector('[data-history-picker]')?.focus();
  });
  panel.addEventListener('change', event => {
    if (!event.target.matches('[data-history-picker]')) return;
    revision++;
    selected = Number(event.target.value);
    render();
    panel.querySelector('[data-history-picker]')?.focus();
  });
  void loadPage();
}
