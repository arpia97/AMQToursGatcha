function focusState(row, data) {
  if (row.kind !== 'activity') return 'unknown';
  return data.event !== 'pagehide' && data.visibility === 'visible' && data.focused
    ? 'focused' : 'unfocused';
}

export function reviewTimeline(sql, players, {round, player}, now = Date.now()) {
  const windows = sql.exec(`
    SELECT json_extract(data,'$.round') AS round,
      MIN(CASE WHEN kind='phase' AND json_extract(data,'$.phase')='guess'
        THEN json_extract(data,'$.startsAt')
        WHEN kind IN ('submit','propose') AND json_extract(data,'$.accepted')=1
          AND json_extract(data,'$.phase')='guess' AND json_extract(data,'$.elapsedMs')>=0
        THEN at-json_extract(data,'$.elapsedMs') END) AS start,
      MAX(CASE WHEN kind='phase' AND json_extract(data,'$.phase')='guess'
        THEN json_extract(data,'$.until') END) AS deadline,
      MIN(CASE WHEN kind='round-result' THEN at END) AS scored,
      MIN(CASE WHEN kind='ended' OR kind='phase' AND json_extract(data,'$.phase')='cancelled' THEN at END) AS stopped
    FROM review_events WHERE kind IN ('phase','submit','propose','round-result','ended')
    GROUP BY 1 HAVING start IS NOT NULL OR scored IS NOT NULL ORDER BY 1
  `).toArray();
  const window = windows.find(entry => entry.round === Number(round)) ?? windows[0];
  const rounds = windows.map(entry => entry.round);
  if (window?.start == null) return {rounds, round: window?.round ?? null, duration: null, tracks: []};
  const start = window.start;
  const end = Math.max(start, Math.min(window.scored ?? window.stopped ?? now, window.deadline ?? Infinity));
  const duration = end - start;
  const roster = player ? players.filter(entry => String(entry.id) === player) : players;
  const tracks = new Map(roster.map(({id}) => [String(id), {
    player: String(id), since: 0, state: 'unknown', segments: [], answers: [],
  }]));

  const initial = sql.exec(`
    SELECT e.player,e.kind,e.data FROM review_events e JOIN (
      SELECT max(seq) AS seq FROM review_events WHERE at<?
      AND kind IN ('activity','connected','disconnected','left','log-limit') GROUP BY player
    ) last ON e.seq=last.seq ORDER BY e.seq
  `, start).toArray();
  for (const row of initial) {
    if (!row.player && row.kind === 'log-limit') {
      for (const track of tracks.values()) track.state = 'unknown';
      continue;
    }
    const track = tracks.get(row.player);
    if (track) track.state = focusState(row, JSON.parse(row.data));
  }
  const events = sql.exec(`
    SELECT at,player,kind,data FROM review_events
    WHERE at>=? AND at<=? AND kind IN ('activity','connected','disconnected','left','log-limit','submit','propose')
    ORDER BY at,seq
  `, start, end);

  function updateFocus(track, at, state) {
    if (track.state === state) return;
    if (at > track.since) track.segments.push({from: track.since, to: at, state: track.state});
    track.state = state;
    track.since = at;
  }

  for (const row of events) {
    const data = JSON.parse(row.data);
    const at = row.at - start;
    if (row.kind === 'log-limit' && !row.player) {
      for (const track of tracks.values()) updateFocus(track, at, 'unknown');
      continue;
    }
    const track = tracks.get(row.player);
    if (!track) continue;
    if (row.kind === 'submit' || row.kind === 'propose') {
      if (data.round !== window.round || data.phase !== 'guess' || data.accepted !== true) continue;
      const answers = row.kind === 'propose' ? {[data.field]: data.answer} : data.answers;
      const fields = Object.fromEntries(Object.entries(answers ?? {}).filter(([, value]) => typeof value === 'string' && value.trim()));
      if (Object.keys(fields).length) track.answers.push({at, fields});
    } else {
      updateFocus(track, at, focusState(row, data));
    }
  }
  if (window.scored != null) {
    const automatic = sql.exec(`
      SELECT player,data FROM review_events WHERE kind='round-result'
      AND json_extract(data,'$.round')=? AND json_extract(data,'$.autoSubmitted')=1
    `, window.round);
    for (const row of automatic) {
      const track = tracks.get(row.player);
      const fields = JSON.parse(row.data).answers;
      if (track && Object.values(fields ?? {}).some(Boolean)) track.answers.push({at: duration, fields, automatic: true});
    }
  }
  return {rounds, round: window.round, duration, tracks: [...tracks.values()].map(track => {
    const {player, since, state, segments, answers} = track;
    if (duration > since) segments.push({from: since, to: duration, state});
    return {player, segments, answers};
  })};
}
