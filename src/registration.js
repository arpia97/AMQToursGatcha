export function registrationAllowed(player, inviteMatches, now) {
  if (!player || player.password) return false;
  // Normal first-time signup needs no code. Host-reset accounts and reserved
  // privileged identities still require their individual recovery code.
  if (!player.is_admin && !player.access_reset) return true;
  return !!inviteMatches && player.invite_expires > now;
}
