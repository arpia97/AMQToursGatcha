import { test } from "node:test";
import assert from "node:assert/strict";
import { registrationAllowed } from "../src/registration.js";
import { authFormHTML } from "../public/auth-form.js";

test("every signup requires an unconsumed, unexpired individual host-issued code", () => {
  const player = {
    password: null,
    is_admin: 0,
    access_reset: 0,
    invite_expires: 2000,
  };
  assert.equal(registrationAllowed(player, false, 1000), false);
  assert.equal(registrationAllowed(player, true, 1000), true);
  assert.equal(registrationAllowed({...player,account_locked:1},true,1000),false);
  assert.equal(registrationAllowed(null, false, 1000), false);
  assert.equal(
    registrationAllowed({ ...player, password: "existing" }, true, 1000),
    false,
  );
  assert.equal(
    registrationAllowed({ ...player, is_admin: 1 }, false, 1000),
    false,
  );
  assert.equal(
    registrationAllowed({ ...player, access_reset: 1 }, false, 1000),
    false,
  );
  assert.equal(
    registrationAllowed({ ...player, access_reset: 1 }, true, 1000),
    true,
  );
  assert.equal(
    registrationAllowed({ ...player, is_admin: 1 }, true, 1000),
    true,
  );
  assert.equal(registrationAllowed(player, true, 3000), false);
  assert.equal(
    registrationAllowed({ ...player, access_reset: 1 }, true, 2000),
    false,
  );
});
test("signup and recovery require a code while existing-account login does not", () => {
  assert.match(authFormHTML("register"), /name="code" required/);
  assert.match(authFormHTML("register"), /Host-issued one-use code/);
  assert.doesNotMatch(authFormHTML("login"), /name="code"/);
  assert.match(authFormHTML("recover"), /Account recovery code/);
  assert.match(authFormHTML("recover"), /name="code" required/);
});
