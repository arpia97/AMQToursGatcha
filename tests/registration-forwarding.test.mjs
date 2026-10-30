import { test } from "node:test";
import assert from "node:assert/strict";
import {
  registrationForwarding,
  registrationPolicy,
} from "../src/registration-forwarding.js";
const request = (body) =>
  new Request("https://example.test/api/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "example-key",
    },
    body: JSON.stringify(body),
  });
test("mixed-version signup forwards the legacy code only inside the server without changing identity or recovery", async () => {
  const env = { BETA_REGISTRATION_CODE: "test-legacy-value" },
    original = request({ player: "123", password: "example-password" }),
    forward = await registrationForwarding(original, env);
  assert.deepEqual(await forward.json(), {
    player: "123",
    password: "example-password",
    code: env.BETA_REGISTRATION_CODE,
  });
  assert.equal(forward.headers.get("Idempotency-Key"), "example-key");
  assert.deepEqual(await original.json(), {
    player: "123",
    password: "example-password",
  });
  const recovery = request({
    player: "123",
    password: "example-password",
    code: "individual-recovery",
  });
  assert.equal(await registrationForwarding(recovery, env), recovery);
  const noSecret = request({ player: "123", password: "example-password" });
  assert.equal(await registrationForwarding(noSecret, {}), noSecret);
  assert.equal(registrationPolicy.registrationCodeRequired, false);
  assert(
    !JSON.stringify(registrationPolicy).includes(env.BETA_REGISTRATION_CODE),
  );
});
test("forwarding is limited to signup and bounds actual streamed request bytes", async () => {
  const env = { BETA_REGISTRATION_CODE: "test-legacy-value" },
    login = new Request("https://example.test/api/login", {
      method: "POST",
      body: "{}",
    });
  assert.equal(await registrationForwarding(login, env), login);
  const invalid = new Request("https://example.test/api/register", {
    method: "POST",
    body: "broken",
  });
  assert.equal(await registrationForwarding(invalid, env), invalid);
  const big = request({ player: "123", padding: "x".repeat(1000001) }),
    result = await registrationForwarding(big, env);
  assert(result instanceof Response);
  assert.equal(result.status, 413);
});
