export function betaRegistrationEnabled(engine, env) {
  return (
    !!env.BETA_REGISTRATION_CODE &&
    engine.one(
      "SELECT value FROM settings WHERE key='beta_registration_enabled'",
    )?.value === 1
  );
}
export function registrationAllowed(player, inviteMatches, betaMatches, now) {
  if (!player || player.password) return false;
  // Shared beta access never claims a privileged identity or a host-reset
  // account, which must use its individually issued recovery code.
  const betaEligible = !player.is_admin && !player.access_reset;
  return (
    (betaMatches && betaEligible) ||
    (inviteMatches && player.invite_expires > now)
  );
}
