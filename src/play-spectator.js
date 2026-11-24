import {arenaStandings} from './play-arena.js';
import {rematchView} from './play-lobby-votes.js';
import {playerAudioReady} from './play-integrity.js';
import {ONE_TEAM_FORMAT} from '../public/play-mode-rules.js';

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
    unit:state.mode==='ngmc-ranked'||state.potatoes||format===ONE_TEAM_FORMAT?'Lives':'Points',scores,
    ...(arena?{round:round+1,rounds:arena.rounds.length}:{}),
  };
}

// A watcher never needs the opening manifest or any upcoming ticket.
export function spectatorClip(state,now){
  if(!state.audioSealed||state.phase!=='guess'||now<state.startsAt||now>=state.until)return null;
  const clip=state.audioPool?.find(entry=>entry.round===state.index);
  return clip?.ticket&&clip.key?{ticket:clip.ticket,key:clip.key}:null;
}

function revealedRound(row){
  return {index:row.index,anime:row.anime,animeTitles:row.animeTitles,song:row.song,songType:row.songType,artist:row.artist,artistMembers:row.artistMembers,
    points:row.points,lives:row.lives,holders:row.holders,spent:row.spent,reset:row.reset,
    results:(row.results||[]).map(({id,answers,correct,earned})=>({id,answers,correct,earned}))};
}

// The observer protocol is built from an allowlist. It never serializes a player view.
export function spectatorView(state,compact=false){
  const previous=state.history.at(-1);
  const reveal=previous && (gameEnded(state.phase) ||
    (previous.index===state.index && ['reveal','counting'].includes(state.phase))) ? {
    ...revealedRound(previous),song:previous.index+1,title:previous.song,
  } : null;
  return {
    id:state.id,mode:state.mode,format:state.format,pool:state.pool||state.lobby?.pool||'random',
    ...liveMatchScore(state),index:state.index,startsAt:state.startsAt,
    until:Number.isFinite(state.until)?state.until:null,reveal,
    history:(compact?state.history.slice(-1):state.history).map(revealedRound),compact,
    ...(state.potatoes?{potatoes:state.potatoes}:{}),teams:state.teams,teamFields:!!state.teamFields,
    ...(state.lobby?{lobby:{seconds:state.lobby.seconds,...(state.lobby.guessFields?{guessFields:state.lobby.guessFields}:{})}}:{}),
    counters:state.counters,autoCounting:state.autoCounting,
    ...(state.arena?{arena:{rounds:state.arena.rounds,songsPerFixture:state.arena.songsPerFixture,standings:arenaStandings(state.arena)}}:{}),
    players:state.players.map(p=>({
      id:p.id,name:p.name,team:p.team,score:p.score,avatar:p.avatar,left:p.left,elo:p.elo,
      initialGuesses:p.initialGuesses,guesses:p.guesses,ready:p.ready,acceptedReady:p.acceptedReady,
      audioReady:Array.isArray(p.loaded)&&playerAudioReady(state,p),locked:p.locked,lockedElapsedMs:p.lockedElapsedMs,
      submittedFields:state.teamFields&&p.field?[p.field]:[],
    })),
    ...(gameEnded(state.phase)?{reason:state.reason,aborted:!!state.aborted,rematch:rematchView(state)}:{}),
  };
}
