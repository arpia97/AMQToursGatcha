// Host review uses the order and receipt times of the retained server events.
// Browser focus observations alone never produce a finding.
const fields = ['anime', 'song', 'artist'];
const normalized = value => String(value ?? '').trim().toLowerCase();
const batchSize = 128;

export function inspectReviewEvent(memory, row, data, highlight) {
  const round = data.round;
  if (!row.player || !Number.isInteger(round)) return;
  const key = ':' + row.player;
  const player = memory[key] ??= {fastRounds: []};
  if (player.round !== round) {
    player.round = round;
    player.song = {entries: {}, candidates: {}};
  }
  const song = player.song;
  const accepted = data.accepted === true && data.phase === 'guess';
  const proposal = row.kind === 'propose';
  if (((row.kind === 'submit' || proposal) && accepted) || row.kind === 'round-result') {
    for (const flag of data.flags || []) {
      const answer = proposal ? data.answer : data.answers?.[flag.field];
      if (answer) highlight('decoy', {field: flag.field, answer, decoy: flag.song, decoyAnime:flag.anime, auto:!!data.autoSubmitted});
    }
  }
  if (['connected','disconnected','unlock','withdraw'].includes(row.kind) && data.accepted !== false) {
    player.song = {entries:{}, candidates:{}};
    return;
  }
  if (data.phase === 'guess' && row.kind === 'activity') {
    if (!['visibility','focus'].includes(data.event)) {
      delete song.away; delete song.returned;
      return;
    }
    if (data.visibility === 'hidden' || data.focused === false) {
      song.away ??= row.at;
      delete song.returned;
    } else if (song.away !== undefined) {
      song.returned = {out:song.away, back:row.at};
      delete song.away;
    }
    return;
  }
  if (accepted && ['submit','propose','answer-draft','artist-edit'].includes(row.kind)) {
    const answers = proposal ? {[data.field]:data.answer} : data.answers || {};
    if (typeof answers !== 'object' || Array.isArray(answers)) return;
    for (const field of fields) {
      if (typeof answers[field] !== 'string') continue;
      const value = normalized(answers[field].slice(0,3500));
      if (song.entries[field]?.value !== value) song.entries[field] = {value, since:row.at};
      if (!value || !Number.isFinite(data.elapsedMs) || data.elapsedMs < 0 || !(proposal || row.kind === 'submit')) continue;
      // Keep the first lock of an identical answer so re-locks cannot appear new.
      const candidates = song.candidates[field] ??= [];
      if (candidates.some(c => c.value === value)) continue;
      const start = row.at - data.elapsedMs;
      const visit = song.returned;
      const timedVisit = visit && visit.out - start >= 2000 && visit.out - start <= 9000 &&
        visit.back - visit.out >= 1500 && row.at >= visit.back && row.at - visit.back <= 2000 &&
        song.entries[field].since >= visit.back;
      const candidate = {value, at:row.at, seq:row.seq, elapsed:data.elapsedMs, ...(timedVisit ? {visit} : {})};
      // Up to eight proposals per field can remain on a team ballot.
      song.candidates[field] = proposal ? [...candidates.slice(-7),candidate] : [candidate];
    }
  }
  if (row.kind !== 'round-result' || data.autoSubmitted) return;
  for (const field of fields) {
    const answer = data.answers?.[field];
    if (!data.correct?.[field]) continue;
    const c = song.candidates[field]?.find(entry => entry.value === normalized(answer));
    if (!c) continue;
    const evidence = {field, answer, submitAt:c.at, submitSeq:c.seq, elapsed:c.elapsed};
    if (c.visit) highlight('return', {...evidence,...c.visit});
    if (c.elapsed <= 1000) {
      if (!player.fastRounds.includes(round)) player.fastRounds.push(round);
      if (player.fastRounds.length >= 3) highlight('fast', {...evidence, rounds:player.fastRounds.slice()});
    }
  }
}

export class ReviewHighlights {
  constructor(storage) {
    this.storage = storage;
    this.sql = storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS match_highlights(seq INTEGER,player TEXT,round INTEGER,kind TEXT,data TEXT,PRIMARY KEY(player,round,kind))');
    this.sql.exec('CREATE INDEX IF NOT EXISTS highlights_sequence ON match_highlights(seq)');
  }
  // Analyze bounded batches outside the gameplay message handler. Persist the
  // cursor and the observations together so alarm retries and host reads agree.
  advance() {
    return this.storage.transactionSync(() => {
      const saved = [...this.sql.exec('SELECT data FROM review_meta WHERE id=3')][0];
      const cursor = saved ? JSON.parse(saved.data) : {seq:0, memory:{}};
      const rows = [...this.sql.exec('SELECT * FROM review_events WHERE seq>? ORDER BY seq LIMIT ?', cursor.seq,batchSize)];
      for (const row of rows) {
        const data = JSON.parse(row.data);
        inspectReviewEvent(cursor.memory, row, data, (kind,evidence) => {
          this.sql.exec('INSERT OR IGNORE INTO match_highlights VALUES(?,?,?,?,?)',row.seq,row.player,data.round,kind,JSON.stringify({at:row.at,...evidence}));
        });
        cursor.seq = row.seq;
      }
      if (rows.length) this.sql.exec('INSERT OR REPLACE INTO review_meta VALUES(3,?,0)',JSON.stringify(cursor));
      return rows.length === batchSize;
    });
  }
  count() {return [...this.sql.exec('SELECT count(*) AS n FROM match_highlights')][0].n;}
  list(player='', offset=0) {
    const skip = Number.isSafeInteger(Number(offset)) ? Math.max(0,Number(offset)) : 0;
    const rows = [...this.sql.exec('SELECT * FROM match_highlights '+(player?'WHERE player=? ':'')+'ORDER BY seq DESC,kind LIMIT 51 OFFSET ?',...(player?[String(player)]:[]),skip)];
    return {rows:rows.slice(0,50).map(r=>({...r,data:JSON.parse(r.data)})),next:rows.length>50?skip+50:null};
  }
}
