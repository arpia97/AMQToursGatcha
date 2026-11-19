import {animeOnlyMode} from '../public/play-mode-rules.js';
import {submittedArtists} from './play-artists.js';
const fields=['anime','song','artist'];
const invalid=()=>{throw Object.assign(Error('Invalid current answer.'),{status:400});};
export function saveDraft(state,player,message,now){
  const allowed=animeOnlyMode(state.mode)?['anime']:fields;
  if(!allowed.includes(message.field)||!message.answers||allowed.some(f=>typeof message.answers[f]!=='string'||message.answers[f].length>300))invalid();
  const artists=message.artists===undefined?[]:submittedArtists(message.artists);
  if(player.locked||state.teamFields&&player.field&&player.field!=='artist')return;
  if(state.teamFields&&player.field&&message.field!==player.field)return;
  const field=message.field;
  const first=player.draft?.field===field?player.draft.at:now;
  player.draft={field,at:first,answers:Object.fromEntries(allowed.map(f=>[f,message.answers[f].trim()])),artists};
}
export function applyTimeoutDrafts(state){
  for(const player of [...state.players].sort((a,b)=>(a.draft?.at??Infinity)-(b.draft?.at??Infinity)||a.id.localeCompare(b.id))){
    const draft=player.draft;if(!draft||player.left||player.locked)continue;
    const answers={...draft.answers};
    if(!animeOnlyMode(state.mode))answers.artist=draft.artists.join(', ');
    if(state.teamFields){
      const field=player.field||draft.field;
      if(player.field&&field!=='artist'||state.players.some(p=>p.team===player.team&&p.id!==player.id&&p.field===field)||!answers[field])continue;
      player.field=field;player.answers={[field]:answers[field]};
      if(field==='artist')player.artists=draft.artists;
    }else {player.answers=answers;if(!animeOnlyMode(state.mode))player.artists=draft.artists;}
    player.autoSubmitted=true;
  }
}
