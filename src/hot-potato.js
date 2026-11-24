import {passTargets, mustPass, potatoRules} from '../public/hot-potato.js';

function randomPlayer(players) {
  return players[Math.floor(Math.random() * players.length)];
}

export function beginPotatoSong(state) {
  state.potatoes = state.teams.map((_, team) => {
    const active = state.players.filter(p => !p.left && p.team === team);
    const previous = state.potatoes?.[team]?.holder;
    if (!active.some(p => p.guesses > 0)) for (const p of active) p.guesses = potatoRules.guesses;
    const holder = active.find(p => p.id === previous) || randomPlayer(active.filter(p => p.guesses > 0));
    return {holder:holder?.id, previous, spent:false, passed:false};
  });
}

// A departure before a guess is spent hands the turn to a remaining teammate.
export function replaceDepartedHolders(state) {
  for (const [team,turn] of state.potatoes.entries()) {
    if (turn.spent || !state.players.find(p=>p.id===turn.holder)?.left) continue;
    const teammates = state.players.filter(p=>p.team===team && !p.left);
    if (!teammates.length) continue;
    if (teammates.every(p=>p.guesses===0)) for (const p of teammates) p.guesses=potatoRules.guesses;
    passPotato(state,team,randomPlayer(passTargets(state,team)));
  }
}

export function passPotato(state, team, target) {
  const turn = state.potatoes[team];
  const prior = state.players.find(p => p.id === turn.holder);
  delete prior.draft;
  prior.answers = {};
  target.guesses--;
  Object.assign(turn, {holder:target.id, spent:true, passed:true});
}

export function spendPotato(state, player) {
  const turn = state.potatoes[player.team];
  if (!turn.spent) {
    player.guesses--;
    turn.spent = true;
  }
}

export function finishPotatoTurns(state) {
  for (const [team, turn] of state.potatoes.entries()) {
    if (mustPass(state, team)) passPotato(state, team, randomPlayer(passTargets(state, team)));
    else if (!turn.spent) {
      const holder = state.players.find(p => p.id === turn.holder);
      if (holder && holder.guesses > 0) spendPotato(state, holder);
    }
  }
}
