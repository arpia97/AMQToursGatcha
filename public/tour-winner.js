const invalid = (message) => Object.assign(new Error(message), { status: 400 });
export function formatWinnerTeam(value, resolve = (name) => name) {
  const roster = value.split(/\|\s*(?:Total|Guesses)\s*=/i)[0].trim();
  if (/\((-?\d+(?:\.\d+)?)\)/.test(roster)) {
    const names = [];
    let end = 0;
    for (const m of roster.matchAll(/([^()]+?)\s*\((-?\d+(?:\.\d+)?)\)/g)) {
      if (m.index !== end)
        throw invalid("Use name (score) entries for each team.");
      names.push(m[1].trim());
      end = m.index + m[0].length;
    }
    if (roster.slice(end).trim() || !names.length)
      throw invalid("Cannot read this team result.");
    return names.map(resolve).join(" | ");
  }
  return roster
    .split("|")
    .map((n) => resolve(n.trim()))
    .filter(Boolean)
    .join(" | ");
}
export function winnerTeams(value, resolve) {
  const teams = typeof value === "string" ? value.split(/\r?\n/) : value;
  if (!Array.isArray(teams)) throw invalid("Enter one team per line.");
  if (teams.some((v) => typeof v !== "string"))
    throw invalid("Enter valid team names.");
  const names = teams
    .map((v) => (typeof v === "string" ? formatWinnerTeam(v, resolve) : ""))
    .filter(Boolean);
  if (names.length < 2 || names.length > 64)
    throw invalid("Enter between 2 and 64 teams.");
  if (
    new Set(names.map((v) => v.normalize("NFKC").toLowerCase())).size !==
    names.length
  )
    throw invalid("Each team must have a different name.");
  return names;
}
export function pickemTeams(p) {
  if (Array.isArray(p.teams)) return p.teams;
  try {
    const teams = JSON.parse(p.teams || "[]");
    return Array.isArray(teams) ? teams : [];
  } catch {
    return [];
  }
}
export function winnerPredictionBody(values) {
  const pickem = Number(values.pickem);
  if (!Number.isSafeInteger(pickem) || pickem < 1)
    throw invalid("Choose a tour.");
  const teams = pickemTeams({ teams: values.expectedTeams });
  if (!teams.includes(values.winner))
    throw invalid("Choose a team to win the tour.");
  return { pickem, winner: values.winner, expectedTeams: values.expectedTeams };
}
