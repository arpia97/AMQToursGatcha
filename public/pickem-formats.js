const invalid = (message) => Object.assign(new Error(message), { status: 400 });
export const FORMAT_NAMES = {
  "double-4": "Double round robin · 4 teams",
  "single-6": "Single round robin · 6 teams",
  swiss: "Swiss · 8+ teams",
};
export function validateTeams(format, teams) {
  if (
    !Object.hasOwn(FORMAT_NAMES, format) ||
    !Array.isArray(teams) ||
    teams.some((t) => typeof t !== "string" || !t.trim() || t.length > 100)
  )
    throw invalid("Enter valid team names.");
  const clean = teams.map((t) => t.trim());
  if (new Set(clean.map((t) => t.toLowerCase())).size !== clean.length)
    throw invalid("Team names must be unique.");
  if (
    format === "swiss"
      ? clean.length < 8 || clean.length > 64
      : clean.length !== (format === "double-4" ? 4 : 6)
  )
    throw invalid(
      format === "swiss"
        ? `Swiss supports 8–64 teams. You entered ${clean.length}. Put each team on a separate line.`
        : "This format requires exactly " +
            (format === "double-4" ? 4 : 6) +
            ` teams. You entered ${clean.length}. Put each team on a separate line.`,
    );
  return clean;
}
export function roundRobin(format, teams) {
  teams = validateTeams(format, teams);
  if (format === "swiss")
    throw invalid("Swiss pairings are generated one round at a time.");
  const rotating = [...teams],
    rounds = [];
  for (let r = 0; r < teams.length - 1; r++) {
    const pairs = [];
    for (let i = 0; i < teams.length / 2; i++)
      pairs.push(
        r % 2
          ? [rotating.at(-1 - i), rotating[i]]
          : [rotating[i], rotating.at(-1 - i)],
      );
    rounds.push(pairs);
    rotating.splice(1, 0, rotating.pop());
  }
  return format === "double-4"
    ? [...rounds, ...rounds.map((pairs) => pairs.map(([a, b]) => [b, a]))]
    : rounds;
}
// Physical double round robin still has two legs; each prediction covers both.
export function pickemRounds(format, teams) {
  const rounds = roundRobin(format, teams);
  return format === "double-4" ? rounds.slice(0, teams.length - 1) : rounds;
}
export function pickemOutcome(a, b, mode = "match") {
  if (
    mode === "pair" &&
    (!Number.isInteger(a) ||
      !Number.isInteger(b) ||
      a < 0 ||
      b < 0 ||
      a + b !== 2)
  )
    throw invalid(
      "Choose 2:0, 1:1 or 0:2 for a combined double-round-robin matchup.",
    );
  if (a === b && mode !== "pair")
    throw invalid(
      "A winning team is required; draws are not supported for this match.",
    );
  return a === b ? "draw" : a > b ? "a" : "b";
}
export function swissRound(teams, matches = [], byes = []) {
  teams = validateTeams("swiss", teams);
  const rows = new Map(
    teams.map((team, seed) => [
      team,
      { team, seed, wins: 0, diff: 0, opponents: [], buchholz: 0 },
    ]),
  );
  for (const m of matches) {
    if (!m.settled)
      throw invalid(
        "Settle every match in the current round before preparing the next Swiss round.",
      );
    const a = rows.get(m.team_a),
      b = rows.get(m.team_b);
    if (!a || !b || a === b || m.result_a === m.result_b)
      throw invalid("Invalid Swiss results.");
    (m.result_a > m.result_b ? a : b).wins++;
    a.diff += m.result_a - m.result_b;
    b.diff += m.result_b - m.result_a;
    a.opponents.push(b.team);
    b.opponents.push(a.team);
  }
  for (const b of byes) {
    if (!rows.has(b.team)) throw invalid("Invalid Swiss bye.");
    rows.get(b.team).wins++;
  }
  for (const row of rows.values())
    row.buchholz = row.opponents.reduce((s, t) => s + rows.get(t).wins, 0);
  const standings = [...rows.values()].sort(
    (a, b) =>
      b.wins - a.wins ||
      b.buchholz - a.buchholz ||
      b.diff - a.diff ||
      a.seed - b.seed,
  );
  const bye =
    teams.length % 2
      ? [...standings]
          .reverse()
          .find((s) => !byes.some((b) => b.team === s.team))?.team
      : null;
  if (teams.length % 2 && !bye)
    throw invalid("Every team has already received a bye.");
  const active = teams.filter((t) => t !== bye);
  if (!matches.length)
    return {
      pairs: active
        .slice(0, active.length / 2)
        .map((t, i) => [t, active[i + active.length / 2]]),
      standings,
      bye,
    };
  let attempts = 0;
  const pair = (remaining) => {
    if (!remaining.length) return [];
    if (++attempts > 20000) return null;
    const [a, ...rest] = remaining;
    const choices = rest
      .filter((b) => !a.opponents.includes(b.team))
      .sort(
        (b, c) =>
          Math.abs(a.wins - b.wins) - Math.abs(a.wins - c.wins) ||
          Math.abs(a.seed - b.seed) - Math.abs(a.seed - c.seed),
      );
    for (const b of choices) {
      const tail = pair(rest.filter((c) => c !== b));
      if (tail) return [[a.team, b.team], ...tail];
    }
    return null;
  };
  const pairs = pair(standings.filter((s) => s.team !== bye));
  if (!pairs)
    throw invalid(
      "No rematch-free Swiss pairing found. End this event or publish any extra matches individually.",
    );
  return { pairs, standings, bye };
}
