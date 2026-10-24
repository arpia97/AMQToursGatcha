import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SqlBudget,
  storageQuotaResponse,
  nextBudgetDay,
} from "../src/sql-budget.js";

test("background budget survives restarts and resumes at the UTC day boundary", () => {
  let time = Date.UTC(2026, 9, 23, 23, 59, 59),
    saved = null;
  const make = () =>
    new SqlBudget(
      () => structuredClone(saved),
      (v) => {
        saved = structuredClone(v);
      },
      () => time,
    );
  let budget = make();
  budget.observe(1999999, 29999);
  assert.equal(budget.paused(), false);
  budget.observe(1, 0);
  budget.flush();
  budget = make();
  assert.equal(budget.paused(), true);
  assert.equal(budget.status().nextResumeAt, Date.UTC(2026, 9, 24) + 1000);
  time += 1000;
  assert.equal(budget.paused(), false);
  assert.equal(budget.status().rowsRead, 0);
  budget.observe(0, 30000);
  assert.equal(budget.paused(), true);
});
test("real free-plan quota errors return a retryable response without implying data was deleted", async () => {
  const now = Date.UTC(2026, 9, 23, 23, 30);
  const r = storageQuotaResponse(
    new Error("Exceeded allowed rows read in Durable Objects free tier."),
    now,
  );
  assert.equal(r.status, 503);
  assert.equal(Number(r.headers.get("Retry-After")), 300);
  assert.equal((await r.json()).retryAt, now + 5 * 60000);
  const afterReset = Date.UTC(2026, 9, 24, 0, 1);
  assert.equal(
    (
      await storageQuotaResponse(
        new Error("Exceeded allowed rows read in Durable Objects free tier."),
        afterReset,
      ).json()
    ).retryAt,
    afterReset + 5 * 60000,
  );
  const nearReset = Date.UTC(2026, 9, 23, 23, 59);
  assert.equal(
    (
      await storageQuotaResponse(
        new Error("Exceeded allowed rows read in Durable Objects free tier."),
        nearReset,
      ).json()
    ).retryAt,
    nextBudgetDay(nearReset),
  );
  assert.equal(storageQuotaResponse(new Error("Unrelated error")), null);
});
