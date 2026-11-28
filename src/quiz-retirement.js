import { fail } from "./engine.js";

// One explicitly authorized removal. Never run automatically on startup.
export const AKINO_QUIZ_ID = "3817093a-993e-47c8-88be-2804df54ef56";
export const AKINO_RETIREMENT_ID = "akino-removal-2026-11-15-v1";
export const AKINO_RETIREMENT_SCOPE = "host:quiz-retirement";

export function quizRetirementPreview(e) {
  const quiz = e.one("SELECT id,name,updated FROM quizzes WHERE id=?", AKINO_QUIZ_ID);
  if (!quiz || quiz.name !== "AKINO") fail("The authorized AKINO quiz was not found.", 409);
  const ledger = e.all(
    "SELECT id,player,delta,reason,at FROM ledger WHERE reason GLOB 'Quiz: AKINO · [0-9]*/20' AND delta>0 ORDER BY id",
  );
  const amounts = new Map();
  for (const entry of ledger) amounts.set(entry.player, (amounts.get(entry.player) || 0) + entry.delta);
  const players = [...amounts].map(([id, credits]) => {
    const p = e.player(id);
    if (!Number.isSafeInteger(credits) || credits <= 0 || p.earned < credits)
      fail("Quiz rewards no longer reconcile with lifetime earnings.", 409);
    return { player: id, name: p.name, credits, balanceBefore: p.balance, balanceAfter: p.balance - credits, earnedBefore: p.earned, earnedAfter: p.earned - credits };
  });
  return {
    expected: { quiz, ledger }, players,
    credits: players.reduce((sum, p) => sum + p.credits, 0),
    payouts: ledger.length,
    negativeBalances: players.filter(p => p.balanceAfter < 0).length,
  };
}

function enableSignedWallets(e) {
  const schema = e.one("SELECT sql FROM sqlite_master WHERE type='table' AND name='players'")?.sql;
  const constraint = /\s+CHECK\s*\(\s*balance\s*>=\s*0\s*\)/i;
  if (!constraint.test(schema || "")) return false;
  // SQLite cannot DROP CHECK. Rebuild only this table in the surrounding
  // transaction, preserving every column, value, index and trigger.
  if (e.all("SELECT name FROM sqlite_master WHERE type='view' OR upper(sql) LIKE '%REFERENCES PLAYERS%'").length)
    fail("Player schema dependencies require review before signed wallets.", 409);
  const indexes = e.all("SELECT sql FROM sqlite_master WHERE tbl_name='players' AND type IN ('index','trigger') AND sql IS NOT NULL ORDER BY type,name");
  const accounts = JSON.stringify(e.all("SELECT * FROM players ORDER BY id"));
  const columns = e.all("PRAGMA table_info(players)").map(c => '"' + c.name.replaceAll('"', '""') + '"').join(",");
  const create = schema.replace(/^CREATE TABLE\s+(?:"players"|players)/i, 'CREATE TABLE "players_signed_wallet_v1"').replace(constraint, "");
  if (create === schema || !create.includes('CREATE TABLE "players_signed_wallet_v1"'))
    fail("Unexpected player table schema.", 409);
  e.run(create);
  e.run(`INSERT INTO players_signed_wallet_v1(${columns}) SELECT ${columns} FROM players`);
  const externalTriggers = e.all("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND (name GLOB 'inbox_*' OR name='avatar_artwork_removed')");
  for (const row of externalTriggers) e.run('DROP TRIGGER "'+row.name.replaceAll('"','""')+'"');
  e.run("DROP TABLE players");
  e.run("ALTER TABLE players_signed_wallet_v1 RENAME TO players");
  for (const row of [...indexes,...externalTriggers]) e.run(row.sql);
  if (JSON.stringify(e.all("SELECT * FROM players ORDER BY id")) !== accounts)
    fail("Player fields changed during wallet migration.", 409);
  return true;
}

export function retireAkinoQuiz(e, body, bookmark) {
  if (typeof bookmark !== "string" || !bookmark) fail("A recovery bookmark is required.");
  if (body.confirmation !== "REMOVE AKINO AND RECLAIM ALL REWARDS")
    fail("Confirm the authorized quiz removal.");
  const preview = quizRetirementPreview(e);
  if (JSON.stringify(preview.expected) !== JSON.stringify(body.expected))
    fail("AKINO or its payouts changed. Review a fresh preview.", 409);
  const migrated = enableSignedWallets(e);
  const reason = "Quiz reward reversal: AKINO · removed by owner";
  for (const p of preview.players) {
    e.run("UPDATE players SET balance=balance-?,earned=earned-? WHERE id=?", p.credits, p.credits, p.player);
    e.run("INSERT INTO ledger(player,delta,reason,at) VALUES(?,?,?,?)", p.player, -p.credits, reason, e.now());
  }
  const deleted = {};
  for (const table of ["quiz_songs", "quiz_answers", "quiz_progress", "quiz_runs", "quiz_reward_history", "profile_title_preferences"]) {
    deleted[table] = e.one(`SELECT count(*) AS n FROM ${table} WHERE quiz=?`, AKINO_QUIZ_ID).n;
    e.run(`DELETE FROM ${table} WHERE quiz=?`, AKINO_QUIZ_ID);
  }
  const key = "quiz:" + AKINO_QUIZ_ID;
  for (const row of e.all("SELECT player,data FROM profile_title_order WHERE instr(data,?)>0", key)) {
    const order = JSON.parse(row.data);
    if (!Array.isArray(order)) fail("Unexpected title order data.", 409);
    e.run("UPDATE profile_title_order SET data=? WHERE player=?", JSON.stringify(order.filter(id => id !== key)), row.player);
  }
  e.run("DELETE FROM player_notices WHERE kind='quiz-leader-beaten' AND json_extract(metadata,'$.quiz')=?", AKINO_QUIZ_ID);
  e.run("DELETE FROM quizzes WHERE id=?", AKINO_QUIZ_ID);
  e.quiz.statisticsCache = null;
  return { message: "AKINO removed and its issued credits reclaimed.", repairId: AKINO_RETIREMENT_ID, quiz: AKINO_QUIZ_ID, credits: preview.credits, payouts: preview.payouts, players: preview.players, negativeBalances: preview.negativeBalances, deleted, signedWalletMigration: migrated, bookmark };
}
