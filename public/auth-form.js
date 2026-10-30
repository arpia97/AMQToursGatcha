export function authFormHTML(mode = "login") {
  const recovery = mode === "recover",
    register = mode !== "login";
  const title = recovery
    ? "Recover Your Account."
    : register
      ? "Join AMQ Gatcha."
      : "Good to See You Again.";
  const description = recovery
    ? "Use the one-use recovery code from your host to set a new password."
    : register
      ? "Create your account with your AMQ Tours player ID or an imported alias. No registration code is needed."
      : "Sign in with your AMQ Tours ID or an imported alias.";
  return `<h2>${title}</h2><p>${description}</p><div class="tabs"><button class="tab ${register ? "" : "active"}" data-action="signin-form">Sign in</button><button class="tab ${register && !recovery ? "active" : ""}" data-action="register-form">Register</button></div><form id="auth-form" class="stack"><input type="hidden" name="mode" value="${register ? "register" : "login"}"><label>AMQ player ID or alias<input name="player" required autocomplete="username" maxlength="100"></label>${recovery ? '<label>Account recovery code<input name="code" required autocomplete="off"></label>' : ""}<label>Password<input type="password" name="password" required minlength="${register ? 12 : 8}" maxlength="256" autocomplete="${register ? "new-password" : "current-password"}"></label><div class="form-error" role="alert"></div><button type="submit" class="button full">${recovery ? "Set new password" : register ? "Create account" : "Sign in"} →</button><span class="form-hint">${register ? "Use at least 12 characters." : "Need a password reset? Ask your tour host for a recovery code."}</span></form>${!recovery ? '<button type="button" class="text-button" data-action="recovery-form">Recover account access →</button>' : ""}`;
}
