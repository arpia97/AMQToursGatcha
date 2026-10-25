import { test } from "node:test";
import assert from "node:assert/strict";
import {
  registrationAllowed,
  betaRegistrationEnabled,
} from "../src/registration.js";

test("shared beta registration is limited to unregistered nonprivileged identities, while recovery stays individual", () => {
  const player = {
    password: null,
    is_admin: 0,
    access_reset: 0,
    invite_expires: 2000,
  };
  assert.equal(registrationAllowed(player, false, true, 1000), true);
  assert.equal(registrationAllowed(null, false, true, 1000), false);
  assert.equal(
    registrationAllowed({ ...player, password: "existing" }, true, true, 1000),
    false,
  );
  assert.equal(
    registrationAllowed({ ...player, is_admin: 1 }, false, true, 1000),
    false,
  );
  assert.equal(
    registrationAllowed({ ...player, access_reset: 1 }, false, true, 1000),
    false,
  );
  assert.equal(
    registrationAllowed({ ...player, access_reset: 1 }, true, false, 1000),
    true,
  );
  assert.equal(
    registrationAllowed({ ...player, is_admin: 1 }, true, false, 1000),
    true,
  );
  assert.equal(registrationAllowed(player, false, false, 1000), false);
  assert.equal(registrationAllowed(player, true, false, 2000), false);
});
test("beta access requires both the server secret and enabled setting", () => {
  let value = 1;
  const engine = { one: () => ({ value }) };
  assert.equal(betaRegistrationEnabled(engine, {}), false);
  assert.equal(
    betaRegistrationEnabled(engine, { BETA_REGISTRATION_CODE: "example" }),
    true,
  );
  value = 0;
  assert.equal(
    betaRegistrationEnabled(engine, { BETA_REGISTRATION_CODE: "example" }),
    false,
  );
});
