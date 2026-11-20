export const spectatorTag='play-spectators';
export const gameEnded=phase=>phase==='finished'||phase==='cancelled';

export function liveMatchScore(state){
  const {arena,format,index,players,teams}=state;
  const individual=format==='lobby-ffa'||(!arena&&teams.length>1&&teams.length===players.length);
  const teamName=team=>individual?players.find(player=>player.team===team)?.name:
    teams.length===1?'Team':'Team '+(team+1);
  const round=arena?Math.min(arena.rounds.length-1,Math.floor(index/arena.songsPerFixture)):null;
  const scores=arena
    ? arena.rounds[round].map(({home,away,scores})=>[
      {team:home,label:teamName(home),value:scores[0]},
      {team:away,label:teamName(away),value:scores[1]},
    ])
    : [teams.map((value,team)=>({team,label:teamName(team),value}))];
  return {
    phase:state.phase,song:Math.min(index+1,state.songs.length),total:state.songs.length,
    unit:state.mode==='ngmc-ranked'?'Lives':'Points',scores,
    ...(arena?{round:round+1,rounds:arena.rounds.length}:{}),
  };
}

// The observer protocol is built from an allowlist. It never serializes a player view.
export function spectatorView(state){
  const previous=state.history.at(-1);
  const reveal=previous && (gameEnded(state.phase) ||
    (previous.index===state.index && ['reveal','counting'].includes(state.phase))) ? {
    song:previous.index+1, anime:previous.anime, title:previous.song, artist:previous.artist,
    results:(previous.results||[]).map(({id,answers,correct})=>({id,answers,correct})),
  } : null;
  return {
    id:state.id,format:state.format,pool:state.pool||state.lobby?.pool||'random',
    ...liveMatchScore(state),
    until:Number.isFinite(state.until)?state.until:null, reveal,
    players:state.players.map(({id,name,team,score,avatar,left})=>({id,name,team,score,avatar,left})),
    ...(gameEnded(state.phase)?{reason:state.reason,aborted:!!state.aborted}:{}),
  };
}
