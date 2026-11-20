const stateLabels = {focused:'Focused',unfocused:'Unfocused',unknown:'Unknown'};
const seconds = (ms, digits = 2) => (ms / 1000).toFixed(digits) + 's';
const percent = (at, duration) => Math.max(0, Math.min(100, 100 * at / (duration || 1)));

function answerText(answer) {
  const fields = Object.entries(answer.fields).filter(([, value]) => value);
  return (answer.automatic ? 'Automatic answer' : 'Answer') + ' at ' + seconds(answer.at) +
    ' · ' + fields.map(([field, value]) => field + ' · ' + value).join(' / ');
}

export function timelineHTML(data, names, escape) {
  if (!data?.rounds.length) return '<p>No song timelines were recorded for this match.</p>';
  const options = data.rounds.map(round => '<option value="' + round + '"' +
    (round === data.round ? ' selected' : '') + '>Song ' + round + '</option>').join('');
  const header = '<header class="review-timeline-head"><label>Song <select data-review-round>' + options +
    '</select></label><div class="review-timeline-legend">' +
    Object.entries(stateLabels).map(([state, label]) => '<span><i class="' + state + '"></i>' + label + '</span>').join('') +
    '<span><i class="answer"></i>Answer</span></div></header>';
  if (data.duration === null) return header + '<p>Timing is unavailable for this song.</p>';

  const axis = '<div class="review-timeline-axis">' + [0, .25, .5, .75, 1].map(part =>
    '<span>' + seconds(data.duration * part, 1) + '</span>').join('') + '</div>';
  const lines = data.tracks.map((track, index) => {
    const states = track.segments.map(({from, to, state}) => '<span class="' + state + '" style="left:' +
      percent(from,data.duration) + '%;width:' + percent(to-from,data.duration) + '%" title="' +
      stateLabels[state] + ' · ' + seconds(from) + '–' + seconds(to) + '"></span>').join('');
    const markers = track.answers.map((answer, marker) => '<button type="button" class="review-timeline-marker' +
      (answer.automatic ? ' automatic' : '') + '" style="left:' + percent(answer.at,data.duration) +
      '%" aria-label="' + escape(answerText(answer)) + '" title="' + escape(answerText(answer)) +
      '" data-review-track="' + index + '" data-review-answer="' + marker + '"></button>').join('');
    const focused = track.segments.filter(segment => segment.state === 'focused').reduce((sum, segment) => sum + segment.to - segment.from, 0);
    return '<div class="review-timeline-row"><div class="review-timeline-player"><strong>' +
      escape(names.get(track.player) || track.player) + '</strong><small>' + seconds(focused,1) +
      ' focused · ' + track.answers.length + (track.answers.length === 1 ? ' answer' : ' answers') +
      '</small></div><div class="review-timeline-line"><div class="review-timeline-band">' + states +
      '</div>' + markers + '</div></div>';
  }).join('');
  return '<section class="review-timeline">' + header + axis + lines +
    '<p class="review-timeline-detail" role="status" data-review-marker-detail>Choose a marker to see its answer and time.</p></section>';
}

export function showTimelineAnswer(target, data, names, {reviewTrack, reviewAnswer}) {
  const track = data?.tracks[reviewTrack];
  const answer = track?.answers[reviewAnswer];
  if (target && answer) target.textContent = (names.get(track.player) || track.player) + ' · ' + answerText(answer);
}
