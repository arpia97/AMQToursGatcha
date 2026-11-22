import {titleKey,artistKey} from './play-artists.js';
import {matchGuessFields} from '../public/play-mode-rules.js';

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
    if(options.some(option=>option.key===key))reject('That answer has already been submitted.');
    if(options.filter(option=>option.owner===player.id).length>=8)reject('You have already submitted eight options for this field.');
    options.push({id:crypto.randomUUID(),owner:player.id,answer,key});
    if(player.answeredMatch===false)player.answeredMatch=true;
  }else if(message.type==='withdraw'){
    const index=options.findIndex(option=>option.id===message.choice&&option.owner===player.id);
    if(index<0)reject('Choose one of your own guesses.');
    options.splice(index,1);
    for(const voter of state.players)if(voter.votes?.[field]===message.choice)delete voter.votes[field];
  }else{
    if(message.choice!==null&&!options.some(o=>o.id===message.choice&&state.players.some(p=>p.id===o.owner&&!p.left)))reject('Choose an available answer.');
    player.votes??={};
    if(message.choice===null)delete player.votes[field];
    else player.votes[field]=message.choice;
  }
}
export function ballotsComplete(state){
  const active=state.players.filter(p=>!p.left),ids=new Set(active.map(p=>p.id));
  return matchGuessFields(state).every(field=>{
    const choices=new Set((state.ballot?.[field]||[]).filter(o=>ids.has(o.owner)).map(o=>o.id));
    return active.every(p=>p.autoSkip||choices.has(p.votes?.[field]));
  });
}
export function selectWinners(state){
  const active=state.players.filter(p=>!p.left);
  for(const p of state.players){p.answers={};delete p.artists;delete p.draft;}
  for(const field of matchGuessFields(state)){
    const options=(state.ballot?.[field]||[]).filter(o=>active.some(p=>p.id===o.owner));
    if(!options.length)continue;
    const counts=options.map(o=>active.filter(p=>p.votes?.[field]===o.id).length);
    const max=Math.max(...counts),leaders=options.filter((_,i)=>counts[i]===max);
    const chosen=leaders[Math.floor(Math.random()*leaders.length)];
    active.find(p=>p.id===chosen.owner).answers[field]=chosen.answer;
  }
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
