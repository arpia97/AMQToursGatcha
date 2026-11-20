// Each note specifies frequency in Hz, offset and length in seconds, gain, and an optional waveform.
const cues = {
  correct: [1174.66,1479.98,1760].flatMap((frequency, beat) => {
    const at = beat * .13;
    return [[frequency,at,.28,.31],[frequency*1.55,at,.145,.07],[frequency*2.588,at,.059,.027]];
  }),
  incorrect: [[185,0,.086,.33,'triangle'],[586,0,.028,.08],
    [153,.12,.108,.3,'triangle'],[493,.12,.031,.067]],
  erig: [[523.25,0,.16,.28],[659.25,.07,.16,.29],[783.99,.14,.18,.29],
    [1046.5,.22,.37,.29],[1318.51,.25,.26,.11],[1567.98,.28,.27,.08]],
  'match-found': [[392,0,.18,.28],[523.25,.07,.22,.29],[659.25,.14,.33,.28],[783.99,.14,.33,.12]],
  'matching-start': [[392,0,.12,.21],[523.25,.11,.16,.26]],
  counting: [[440,0,.102,.28]],
};

export const PLAY_CUE_GAIN = 1.3;

export function schedulePlayCue(context, output, name, start, track = () => {}) {
  let end = start;
  for (const [frequency, offset, length, gain, waveform] of cues[name]) {
    const at = start + offset;
    const note = context.createOscillator();
    const envelope = context.createGain();
    note.type = waveform ?? (name === 'counting' ? 'triangle' : 'sine');
    note.frequency.value = frequency;
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(gain, at + .012);
    envelope.gain.exponentialRampToValueAtTime(.0001, at + length);
    note.connect(envelope);
    envelope.connect(output);
    track(note);
    note.addEventListener('ended', () => { note.disconnect(); envelope.disconnect(); }, {once: true});
    note.start(at);
    note.stop(at + length);
    end = Math.max(end, at + length);
  }
  return end;
}

export function createPlaySoundCues(getVolume) {
  let context, unlockPending, generation = 0;
  const active = new Set();

  function unlock() {
    try {
      const Audio = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!Audio) return;
      context ??= new Audio();
      if (context.state !== 'running' && !unlockPending) {
        unlockPending = context.resume().catch(() => {}).finally(() => { unlockPending = null; });
      }
    } catch { /* Gameplay is still usable without sound effects. */ }
  }

  function stop() {
    generation++;
    for (const note of active) note.stop();
    active.clear();
  }

  function play(...names) {
    if (!names.length || !context) return;
    stop();
    const current = generation;
    const requestedAt = performance.now();
    const begin = () => {
      const volume = getVolume();
      if (current !== generation || volume <= 0 || context.state !== 'running' ||
          performance.now() - requestedAt > 500) return;
      const output = context.createGain();
      output.gain.value = volume * PLAY_CUE_GAIN;
      output.connect(context.destination);
      let start = context.currentTime + .01;
      for (const name of names) {
        start = schedulePlayCue(context, output, name, start, note => {
          active.add(note);
          note.addEventListener('ended', () => {
            active.delete(note);
            if (!active.size || current !== generation) output.disconnect();
          }, {once: true});
        }) + .06;
      }
    };
    if (unlockPending) void unlockPending.then(begin);
    else begin();
  }

  return {unlock, play, stop};
}

export function roundSoundCues(previous, next) {
  if (!previous || previous.id !== next.id || previous.index !== next.index || previous.phase !== 'guess' ||
      !['counting','reveal'].includes(next.phase)) return [];
  const round = next.history.at(-1);
  const own = round?.index === next.index && round.results.find(result => result.id === next.me);
  const sounds = [];
  if (own && !next.players.find(player => player.id === next.me)?.left) {
    if (next.mode === 'ngmc-ranked' && own.correct.anime && round.results.filter(result => result.correct.anime).length === 1)
      sounds.push('erig');
    else if (Object.values(own.correct).some(Boolean)) sounds.push('correct');
    else if (Object.values(own.answers).some(Boolean)) sounds.push('incorrect');
  }
  if (next.phase === 'counting') sounds.push('counting');
  return sounds;
}
