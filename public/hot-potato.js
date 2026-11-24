export const POTATO_FORMAT = 'hot-potato';
export const POTATO_COOP = 'hot-potato-team';
export const POTATO_LOBBY = 'lobby-hot-potato';
export const POTATO_COOP_LOBBY = 'lobby-hot-potato-team';
export const isPotatoCoop = format => format === POTATO_COOP || format === POTATO_COOP_LOBBY;
export const isPotato = format => format === POTATO_FORMAT || format === POTATO_LOBBY || isPotatoCoop(format);
export const validPotatoSize = (format, size, custom) => isPotatoCoop(format)
  ? size >= (custom ? 1 : 2) && size <= 8 : size >= 2 && size % 2 === 0;
export const potatoLabel = format => 'Hot Potato · ' + (isPotatoCoop(format) ? '1-Team' : 'Team VS');
export const VARIETY_MODE = 'variety';
export const potatoRules = Object.freeze({songs:100, seconds:20, lives:5, guesses:5, waitMs:20_000});

export function passTargets(match, team) {
  const turn = match.potatoes[team];
  return match.players.filter(p => p.team === team && !p.left && p.id !== turn.holder && p.guesses > 0);
}

export function mustPass(match, team) {
  const turn = match.potatoes[team];
  if (turn.spent) return false;
  return turn.previous === turn.holder && passTargets(match, team).length > 0;
}

export function canAnswerPotato(match, player) {
  return player && !player.left && match.potatoes[player.team].holder === player.id && !mustPass(match, player.team);
}
