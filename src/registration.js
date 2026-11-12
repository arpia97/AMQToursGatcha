export function registrationAllowed(player, inviteMatches, now) {
  if (!player || player.password || player.account_locked) return false;
  // Registration and recovery both consume the individual host-issued code.
  return !!inviteMatches && player.invite_expires > now;
}
