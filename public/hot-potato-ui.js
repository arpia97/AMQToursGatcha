import {rigCount} from './play-rig-count.js';
import {passTargets, mustPass} from './hot-potato.js';
import {playPlayerAvatar} from './play-avatar.js';

export function potatoTeams(match, esc) {
  const me = match.players.find(p => p.id === match.me);
  const order = match.teams.map((_,i)=>i).sort((a,b)=>Number(b===me?.team)-Number(a===me?.team));
  return '<div class="potato-teams">'+order.map(team=>{
    const own = team===me?.team, turn = match.potatoes[team], lives=match.teams[team];
    const name = me ? own ? 'Your team' : 'Opponents' : 'Team '+(team+1);
    const rows = match.players.filter(p=>p.team===team).map(p=>{
      const holder = p.id===turn.holder;
      const label = p.guesses === 1 ? '1 guess remaining' : p.guesses+' guesses remaining';
      const budget = p.left ? '<span class="potato-left">Left</span>' :
        '<span class="potato-budget" role="img" aria-label="'+label+'" title="'+label+'">'+
        '🥔'.repeat(p.guesses)+'</span>';
      return '<li class="'+(holder?'potato-holder':'')+'"><span class="potato-person">'+playPlayerAvatar(p,esc)+
        '<b>'+esc(p.name)+'</b>'+(p.id===match.me?'<small>You</small>':'')+rigCount(p)+(holder&&!p.left?'<small class="potato-holder-label">Holder</small>':'')+'</span>'+budget+'</li>';
    }).join('');
    return '<section class="potato-side '+(me&&!own?'opposing':'')+'"><header><h3>'+name+'</h3><span aria-label="'+lives+' lives">'+
      '♥'.repeat(lives)+'<i>'+'♡'.repeat(5-lives)+'</i></span></header><ul>'+rows+'</ul></section>';
  }).join('')+'</div>';
}

export function potatoTurn(match, esc, now) {
  if(match.phase!=='guess')return '';
  const me=match.players.find(p=>p.id===match.me);
  if(!me)return '';
  const turn=match.potatoes[me.team], holder=match.players.find(p=>p.id===turn.holder);
  const mine=turn.holder===me.id, required=mustPass(match,me.team);
  const targets=mine&&!turn.spent?passTargets(match,me.team):[];
  const title=mine?(required?'Pass the potato':'You have the potato'):(holder?.name||'Your teammate')+' has the potato';
  const detail=mine?(required?'You answered last song. Choose a teammate.':me.locked?'Your answer is submitted.':turn.passed?'Your teammate passed to you. Answer this song.':
    targets.length?'Answer this song or pass to a teammate.':'Answer this song.'):required?'Waiting for a pass.':'Waiting for their answer.';
  return '<section class="potato-turn" aria-live="polite"><div><span class="potato-mark" aria-hidden="true">🥔</span><span><strong>'+esc(title)+'</strong><small>'+detail+'</small></span></div>'+
    (targets.length?'<div class="potato-passes" role="group" aria-label="Pass the potato">'+targets.map(p=>
      '<button type="button" class="button secondary"  ' + (now<match.startsAt||now>=match.until?'disabled ':'') + 'data-potato-pass="'+esc(p.id)+'" aria-label="Pass to '+esc(p.name)+'">↗ '+esc(p.name)+'</button>').join('')+'</div>':'')+'</section>';
}
