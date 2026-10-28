const invalid = (message) => Object.assign(new Error(message), { status: 400 });
export function winnerTeams(value) {
  const teams = typeof value === "string" ? value.split(/\r?\n/) : value;
  if (!Array.isArray(teams)) throw invalid("Enter one team per line.");
  if (teams.some((v) => typeof v !== "string"))
    throw invalid("Enter valid team names.");
  const names = teams
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
  if (names.length < 2 || names.length > 64)
    throw invalid("Enter between 2 and 64 teams.");
  if (names.some((v) => v.length > 100))
    throw invalid("Team names must be at most 100 characters.");
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
