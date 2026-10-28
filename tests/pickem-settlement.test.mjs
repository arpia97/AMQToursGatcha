import { test } from "node:test";
import assert from "node:assert/strict";
import {
  settlementBody,
  settlementDraft,
  settlementPanel,
  settlementTable,
} from "../public/pickem-settlement.js";
const now = 10000;
const match = {
  id: 1,
  team_a: "A <team>",
  team_b: 'B "team"',
  ends: now,
  mode: "pair",
  settled: 0,
  round: 1,
};
const escape = (v) =>
  String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");

test("host result conversion accepts exactly the three combined outcomes and validates ordinary final scores", () => {
  for (const result of ["2:0", "1:1", "0:2"])
    assert.deepEqual(settlementBody(match, { result }, now), {
      pickem: 1,
      scoreA: Number(result[0]),
      scoreB: Number(result[2]),
    });
  for (const result of ["", "3:0", "2:1", "0:0", undefined])
    assert.throws(() => settlementBody(match, { result }, now), /Choose/);
  assert.throws(
    () => settlementBody({ ...match, ends: now + 1 }, { result: "1:1" }, now),
    /closed/,
  );
  assert.throws(
    () => settlementBody({ ...match, settled: 1 }, { result: "1:1" }, now),
    /unsettled/,
  );
  const ordinary = { ...match, mode: "match" };
  assert.deepEqual(
    settlementBody(ordinary, { scoreA: "0", scoreB: "3" }, now),
    { pickem: 1, scoreA: 0, scoreB: 3 },
  );
  for (const scoreA of ["", " ", "1.5", "-1", "1001", "NaN", undefined])
    assert.throws(() => settlementBody(ordinary, { scoreA, scoreB: "2" }, now));
  assert.throws(
    () => settlementBody(ordinary, { scoreA: "2", scoreB: "2" }, now),
    /winning team/,
  );
});

test("host drafts and retry keys survive table redraws but are invalidated when teams or result mode change", () => {
  const saved = {
    ...settlementDraft(match),
    result: "1:1",
    requestKey: "uncertain-request",
  };
  assert.equal(settlementDraft(match, saved), saved);
  for (const change of [
    { team_a: "Replacement" },
    { team_b: "Replacement" },
    { mode: "match" },
  ]) {
    const draft = settlementDraft({ ...match, ...change }, saved);
    assert.equal(draft.result, "");
    assert.equal(draft.requestKey, undefined);
  }
  const html = settlementTable([match], escape, { 1: saved }, now);
  assert.match(html, /value="1:1" selected/);
  assert.match(html, /form="settle-match-1" name="result"/);
  assert.match(html, /data-settle-match="1"/);
  assert.match(html, /A &lt;team>/);
  assert.doesNotMatch(html, /A <team>/);
});

test("host tour table includes all loaded rounds, read-only open/settled rows and separate individual matches", () => {
  const open = { ...match, id: 2, ends: now + 1 },
    settled = { ...match, id: 3, settled: 1, result_a: 1, result_b: 1 },
    ordinary = { ...match, id: 4, mode: "match" };
  const html = settlementTable(
    [match, open, settled, ordinary],
    escape,
    {},
    now,
  );
  assert.equal((html.match(/data-settle-match=/g) || []).length, 2);
  assert.match(html, /Voting open/);
  assert.match(html, /Settled/);
  assert.match(html, /<td>1 : 1<\/td>/);
  assert.match(html, /form="settle-match-4" name="scoreA"/);
  assert.doesNotMatch(html, /data-settle-match="[23]"/);
  const tour = {
    id: 9,
    matches: Array.from({ length: 150 }, (_, i) => ({
      ...match,
      id: 10 + i,
      event_id: 9,
    })),
  };
  const panel = settlementPanel(
    {
      pickemEvents: [{ id: 9, name: "Full tour" }],
      pickems: [{ ...match, ends: 0 }],
    },
    escape,
    tour,
  );
  assert.equal((panel.match(/data-settle-match=/g) || []).length, 151);
  assert.match(panel, /aria-expanded="true"/);
  assert.match(panel, /Previous Individual Matches/);
  assert.match(
    settlementPanel({ pickemEvents: [], pickems: [] }, escape),
    /No published/,
  );
});
