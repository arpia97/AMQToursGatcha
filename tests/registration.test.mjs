import { test } from "node:test";
import assert from "node:assert/strict";
import { registrationAllowed } from "../src/registration.js";
import { authFormHTML } from "../public/auth-form.js";

test("first-time signup requires a registered identity and no code", () => {
  const player = {
    password: null,
    is_admin: 0,
    access_reset: 0,
    invite_expires: 2000,
  };
  assert.equal(registrationAllowed(player, false, 1000), true);
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
  assert.equal(registrationAllowed(player, false, 3000), true);
  assert.equal(
    registrationAllowed({ ...player, access_reset: 1 }, true, 2000),
    false,
  );
});
test("signup form has no code field; one-use recovery has a separate required field", () => {
  assert.doesNotMatch(authFormHTML("register"), /name="code"/);
  assert.match(authFormHTML("register"), /No registration code is needed/);
  assert.doesNotMatch(authFormHTML("login"), /name="code"/);
  assert.match(authFormHTML("recover"), /Account recovery code/);
  assert.match(authFormHTML("recover"), /name="code" required/);
});
