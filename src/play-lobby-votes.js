import {titleKey,artistKey} from './play-artists.js';
import {matchGuessFields,ONE_TEAM_FORMAT} from '../public/play-mode-rules.js';

const reject=message=>{throw Object.assign(Error(message),{status:409});};
export function proposeOrVote(state,player,message){
  const field=message.field;
  if(!matchGuessFields(state).includes(field))reject('Choose an answer category.');
  state.ballot??=Object.fromEntries(matchGuessFields(state).map(field=>[field,[]]));
  const options=state.ballot[field];
  if(message.type==='propose'){
    const answer=typeof message.answer==='string'?message.answer.trim():'';
    const key=field==='artist'?artistKey(answer):titleKey(answer);
    if(!key||answer.length>300)reject('Enter an answer within 300 characters.');
    const existing=options.find(option=>option.key===key&&state.players.some(p=>p.id===option.owner&&!p.left));
    player.lastBallotChoice??={};
    if(existing){
      player.lastBallotChoice[field]=existing.id;
      if(existing.owner!==player.id){
        player.votes??={};
        player.votes[field]=existing.id;
        if(player.answeredMatch===false)player.answeredMatch=true;
      }
      return;
    }
    if(options.filter(option=>option.owner===player.id).length>=8)reject('You have already submitted eight options for this field.');
    const id=crypto.randomUUID();
    options.push({id,owner:player.id,answer,key});
    player.lastBallotChoice[field]=id;
    if(player.answeredMatch===false)player.answeredMatch=true;
  }else if(message.type==='withdraw'){
    const index=options.findIndex(option=>option.id===message.choice&&option.owner===player.id);
    if(index<0)reject('Choose one of your own guesses.');
    options.splice(index,1);
    for(const voter of state.players)if(voter.votes?.[field]===message.choice)delete voter.votes[field];
  }else{
    if(message.choice!==null&&!options.some(o=>o.id===message.choice&&state.players.some(p=>p.id===o.owner&&!p.left)))reject('Choose an available answer.');
    player.lastBallotChoice??={};
    player.lastBallotChoice[field]=message.choice;
    player.votes??={};
    if(message.choice===null)delete player.votes[field];
    else {
      player.votes[field]=message.choice;
      if(state.format===ONE_TEAM_FORMAT && player.answeredMatch===false)player.answeredMatch=true;
    }
  }
}
export function catalogAnswer(catalog,field,answer,key){
  const entries=catalog?.[field];
  if(!entries||!answer)return false;
  const normalized=key??(field==='artist'?artistKey(answer):titleKey(answer));
  return entries.has(normalized)||field==='artist'&&answer.split(',').every(name=>entries.has(artistKey(name)));
}
export function ballotReadiness(state,catalog){
  const active=state.players.filter(p=>!p.left),ids=new Set(active.map(p=>p.id));
  const ready=new Set(ids);
  for(const field of matchGuessFields(state)){
    const options=(state.ballot?.[field]||[]).filter(o=>ids.has(o.owner));
    const valid=new Set(options.filter(o=>catalogAnswer(catalog,field,o.answer,o.key)).map(o=>o.id));
    for(const player of active){
      const vote=player.votes?.[field];
      // Rounds already running at deployment have no stored last action.
      const latest=Object.hasOwn(player.lastBallotChoice||{},field)?player.lastBallotChoice[field]:
        vote??options.findLast(o=>o.owner===player.id)?.id;
      if(!valid.has(latest)||(state.format!==ONE_TEAM_FORMAT&&!valid.has(vote)))ready.delete(player.id);
    }
  }
  return ready;
}
export function ballotCatalogIndex(catalog){
  return Object.fromEntries(Object.entries(catalog).map(([field,names])=>{
    const normalize=field==='artist'?artistKey:titleKey;
    return [field,new Set(names.map(normalize).filter(Boolean))];
  }));
}
export function selectWinners(state,catalog){
  const active=state.players.filter(p=>!p.left);
  for(const p of state.players){p.answers={};delete p.artists;delete p.draft;}
  for(const field of matchGuessFields(state)){
    const options=(state.ballot?.[field]||[]).filter(o=>active.some(p=>p.id===o.owner));
    if(!options.length)continue;
    const counts=options.map(o=>active.filter(p=>p.votes?.[field]===o.id).length);
    const max=Math.max(...counts),leaders=options.filter((_,i)=>counts[i]===max);
    let eligible=leaders;
    if(leaders.length>1&&catalog){
      eligible=leaders.filter(option=>catalogAnswer(catalog,field,option.answer,option.key));
      if(!eligible.length)continue;
    }
    const chosen=eligible.length===1?eligible[0]:eligible[Math.floor(Math.random()*eligible.length)];
    active.find(p=>p.id===chosen.owner).answers[field]=chosen.answer;
  }
}
const rematchPlayers=state=>state.players.filter(p=>!p.left&&!p.chatLeft&&p.disconnectedAt==null);
export function rematchView(state,now=Date.now(),player=null){
  const poll=state.rematch;
  if(!poll)return undefined;
  if(poll.joinUntil>now)return {joinUntil:poll.joinUntil};
  if(poll.until<=now||poll.joinUntil||!player)return undefined;
  const eligible=rematchPlayers(state);
  if(eligible.length<2||!eligible.some(p=>p.id===player))return undefined;
  const required=Math.floor(eligible.length/2)+1;
  const yes=eligible.filter(p=>poll.votes[p.id]===true).length;
  const undecided=eligible.filter(p=>!Object.hasOwn(poll.votes,p.id)).length;
  return {until:poll.until,required,yes,myVote:poll.votes[player],closed:yes+undecided<required};
}

export function voteToRestart(state,id,yes,now){
  const view=rematchView(state,now,id);
  if(!view?.until||view.closed||typeof yes!=='boolean')reject('The restart vote has ended.');
  state.rematch.votes[id]=yes;
  checkRestart(state,now,id);
}

export function checkRestart(state,now,id){
  const eligible=rematchPlayers(state);
  const view=rematchView(state,now,id??eligible[0]?.id);
  if(view?.until&&view.yes>=view.required)state.rematch.joinUntil=now+120_000;
}

export function voteToAbort(state,player,message){
  if(['finished','cancelled'].includes(state.phase))reject('Match has ended.');
  if(message.type==='abort-request'){
    if(state.abortPoll||state.returnPoll)reject('A match vote is already open.');
    state.abortPoll={id:crypto.randomUUID(),required:Math.floor(state.players.length/2)+1,votes:{[player.id]:true}};
    return;
  }
  const poll=state.abortPoll;
  if(!poll||message.poll!==poll.id||typeof message.yes!=='boolean')reject('This vote has ended.');
  poll.votes[player.id]=message.yes;
}
export function checkAbort(state,now){
  const poll=state.abortPoll;
  if(!poll)return false;
  const active=state.players.filter(p=>!p.left);
  const yes=active.filter(p=>poll.votes[p.id]===true).length;
  if(yes>=poll.required){
    state.aborted=true;state.phase='cancelled';state.reason='Match aborted';state.until=now+86400000;
    delete state.abortPoll;return true;
  }
  if(yes+active.filter(p=>!Object.hasOwn(poll.votes,p.id)).length<poll.required)delete state.abortPoll;
  return false;
}
export function returnVote(state,player,message){
  if(['finished','cancelled'].includes(state.phase))reject('Match has ended.');
  if(message.type==='return-request'){
    if(state.returnPoll||state.abortPoll)reject('A match vote is already open.');
    state.returnPoll={id:crypto.randomUUID(),votes:{[player.id]:true}};
  }else{
    if(!state.returnPoll||message.poll!==state.returnPoll.id||typeof message.yes!=='boolean')reject('This vote has ended.');
    state.returnPoll.votes[player.id]=message.yes;
  }
}
export function checkReturn(state,now){
  if(!state.returnPoll)return false;
  const active=state.players.filter(p=>!p.left);
  const votes=active.map(p=>state.returnPoll.votes[p.id]);
  if(votes.filter(v=>v===true).length>active.length/2){
    state.phase='cancelled';state.reason='Returned to Lobby';state.until=now+86400000;
    delete state.returnPoll;return true;
  }
  if(votes.filter(v=>v===false).length>=Math.ceil(active.length/2))delete state.returnPoll;
  return false;
}
