import test from "node:test";
import assert from "node:assert/strict";
import { readApiResponse } from "../public/api-response.js";
test("Player and host responses reject HTML, truncated JSON and empty payloads with safe retryable errors; valid API errors retain status", async () => {
  for (const [body, status] of [
    ["<!DOCTYPE html>Cloudflare error", 503],
    ["<html>unexpected gateway</html>", 200],
    ["{broken", 502],
    ["", 200],
    ["null", 200],
  ]) {
    await assert.rejects(
      readApiResponse(new Response(body, { status })),
      (error) =>
        error.name === "Error" &&
        !/JSON.parse|Unexpected token|DOCTYPE|gateway/.test(error.message) &&
        error.status >= 500 &&
        error.retryable === true,
    );
  }
  await assert.rejects(
    readApiResponse(
      Response.json({ error: "Sign in first." }, { status: 401 }),
    ),
    (error) =>
      error.status === 401 &&
      error.message === "Sign in first." &&
      !error.retryable,
  );
  assert.deepEqual(
    await readApiResponse(Response.json({ message: "Saved", cards: [] })),
    { message: "Saved", cards: [] },
  );
  assert.deepEqual(await readApiResponse(Response.json([{ id: "demo" }])), [
    { id: "demo" },
  ]);
});
