const typeNumbers = {op:1, opening:1, ed:2, ending:2, in:3, insert:3};
const seconds = result => Number.isFinite(result?.lockedElapsedMs) ? result.lockedElapsedMs / 1000 : null;

export function amqHistoryExport(meta, rounds, viewer) {
  const names = new Map(meta.players.map(({id,name}) => [String(id),name]));
  return {
    roomName: 'AMQ Tours Play · ' + meta.format,
    startTime: Number.isFinite(meta.created) ? new Date(meta.created).toUTCString() : null,
    songs: rounds.map(round => {
      const {track, results} = round;
      const type = /^(opening|ending|insert(?: song)?|op|ed|in)\s*(\d+)?/i.exec(round.songType || '');
      const answer = results.find(result => String(result.id) === viewer);
      const hit = answer?.correct?.anime ?? null;
      const time = seconds(answer);
      const guessers = correct => results.filter(result =>
        result.correct?.anime === correct && names.has(String(result.id))
      ).map(result => ({name:names.get(String(result.id)),answerTime:seconds(result)}));
      const correctGuessPlayers = guessers(true);
      const incorrectGuessPlayers = guessers(false);
      return {
        songNumber: round.index + 1,
        songInfo: {
          animeNames: {romaji:round.anime ?? null,english:null},
          artist: round.artist ?? null,
          songName: round.song ?? null,
          type: type ? typeNumbers[type[1].toLowerCase().split(' ')[0]] : null,
          typeNumber: type?.[2] ? Number(type[2]) : null,
          annId: track?.annId ?? null,
          annSongId: track?.annSongId ?? null,
          amqSongId: track?.amqSongId ?? null,
          altAnimeNames: round.anime ? [round.anime] : [],
          altAnimeNamesAnswers: (track?.animeTitles || []).filter(title => title !== round.anime),
          siteIds: track?.siteIds ?? {},
        },
        correctGuess: hit,
        wrongGuess: hit === null ? null : !hit,
        answer: answer?.answers?.anime ? answer.answers.anime + (time === null ? '' : ' (' + answer.lockedElapsedMs + 'ms)') : '',
        correctCount: correctGuessPlayers.length,
        wrongCount: incorrectGuessPlayers.length,
        startPoint: track?.startPoint ?? null,
        videoLength: null,
        videoUrl: track?.audio ?? null,
        correctGuessPlayers,
        incorrectGuessPlayers,
        listStates: [],
      };
    }),
  };
}
