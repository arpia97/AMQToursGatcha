import {matchGuessFields} from '../public/play-mode-rules.js';
import {submittedArtists} from './play-artists.js';
import {arenaVoteAction} from './play-arena.js';
import {proposeOrVote} from './play-lobby-votes.js';
const invalid=()=>{throw Object.assign(Error('Invalid current answer.'),{status:400});};
export function saveDraft(state,player,message,now){
  const allowed=matchGuessFields(state);
  if(!allowed.includes(message.field)||!message.answers||allowed.some(f=>typeof message.answers[f]!=='string'||message.answers[f].length>300))invalid();
  const choices = message.timeoutChoices ?? {};
  if (typeof choices !== 'object' || Array.isArray(choices) ||
      Object.entries(choices).some(([field, value]) =>
        !allowed.includes(field) || typeof value !== 'string' || value.length > 300 ||
        !value.trim() || !message.answers[field].trim())) invalid();
  const artists=message.artists===undefined?[]:submittedArtists(message.artists);
  if(player.locked||state.teamFields&&player.field&&player.field!=='artist')return;
  if(state.teamFields&&player.field&&message.field!==player.field)return;
  const field=message.field;
  const first=player.draft?.field===field?player.draft.at:now;
  player.draft={field,at:first,answers:Object.fromEntries(allowed.map(f=>[f,message.answers[f].trim()])),artists,
    timeoutChoices:choices};
}
export function applyTimeoutDrafts(state, expired){
  const fields = matchGuessFields(state);
  for(const player of [...state.players].sort((a,b)=>(a.draft?.at??Infinity)-(b.draft?.at??Infinity)||a.id.localeCompare(b.id))){
    const draft=player.draft;if(!draft||player.left||player.locked)continue;
    const choices = expired ? draft.timeoutChoices : undefined;
    const answers = {...draft.answers, ...choices};
    let artists = draft.artists;
    if (fields.includes('artist')){
      if (choices?.artist){
        const candidate = [...(player.artists || [])];
        const name = choices.artist.trim();
        const key = name.normalize('NFKC').toLowerCase();
        if (!candidate.some(value => value.normalize('NFKC').toLowerCase() === key)) candidate.push(name);
        if (candidate.length <= 50 && JSON.stringify(candidate).length <= 3500) artists = candidate;
      }
      answers.artist = artists.join(', ');
    }
    if(state.teamFields){
      const field=player.field||draft.field;
      if(player.field&&field!=='artist'||state.players.some(p=>p.team===player.team&&p.id!==player.id&&p.field===field)||!answers[field])continue;
      player.field=field;player.answers={[field]:answers[field]};
      if(field==='artist')player.artists=artists;
    }else {player.answers=answers;if(fields.includes('artist'))player.artists=artists;}
    player.autoSubmitted=true;
  }
}

export function applyTimeoutProposals(state){
  for (const player of state.players){
    if (player.left || !player.draft?.timeoutChoices) continue;
    for (const [field, answer] of Object.entries(player.draft.timeoutChoices)){
      // Keep manually proposed answers and the votes already cast for them.
      if (state.arena ? player.arenaTitle : player.votes?.[field] || state.ballot?.[field]?.some(option => option.owner === player.id)) continue;
      try {
        const propose = state.arena ? arenaVoteAction : proposeOrVote;
        propose(state, player, {type:'propose', field, answer});
        player.autoSubmitted = true;
      } catch (error) {
        // Ignore stale or invalid choices at timeout.
        if (error.status !== 409) throw error;
      }
    }
  }
}
