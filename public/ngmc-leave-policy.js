import {DUEL_FORMAT, duelRules} from './play-mode-rules.js';

export const RANKED_LEAVE_COST = 25;
export const songRatingPools=Object.freeze({'1v1':'Song/Artist 1v1','3v3':'Song/Artist 3v3',[DUEL_FORMAT]:'1v1 Ranked'});
export const INACTIVITY_BAN_MS = 24 * 60 * 60_000;
export const inactivityBanMessage = until =>
  'Matchmaking is locked until '+new Date(until).toUTCString()+' after three consecutive matches without submitting an answer.';

export const RECONNECT_MS = 2 * 60_000;
export function activeRankedGame(match, now) {
  const duel = match?.format === DUEL_FORMAT;
  if (!duel && match?.format !== 'ngmc-ranked') return false;
  if (['loading', 'cancelled', 'finished'].includes(match.phase)) return false;
  if (match.phase === 'reveal' && (duel ? match.index === duelRules.songs-1 : match.index === 34 || match.teams.includes(0))) return false;
  return match.phase !== 'guess' || match.index > 0 || now >= match.startsAt;
}
export const leaveWarning = format => `Leave this ranked match? You will lose ${RANKED_LEAVE_COST} Rating. Three leaves within 14 days trigger a 72-hour ${songRatingPools[format]||'NGMC Ranked'} ban.`;
