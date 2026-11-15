const invalid = (message) => Object.assign(new Error(message), { status: 400 });
export function participationRoster(raw) {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 60000)
    throw invalid("Paste team results or a signup list (up to 60,000 characters).");
  const names = [], teams = [];
  for (const [i, line] of raw.trim().split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const roster = line.split("|")[0].trim(), team = [];
    let end = 0,
      count = 0;
    const pattern =
      /([^()]+?)\s*\((-?\d+(?:\.\d+)?|[A-D][+-]?|S{1,3}[+-]?|Ubers|AG|Anything Goes|None)\)/gi;
    for (const m of roster.matchAll(pattern)) {
      const name = (count ? m[1].replace(/^\s*,\s*/, "") : m[1]).trim();
      if (m.index !== end || !name || name.length > 100)
        throw invalid(
          `Cannot read the players on line ${i + 1}. Use name (score) or name (rank) entries.`,
        );
      names.push(name);
      team.push(name);
      end = m.index + m[0].length;
      count++;
    }
    if (!count || roster.slice(end).trim())
      throw invalid(
        `Cannot read the players on line ${i + 1}. Use name (score) or name (rank) entries.`,
      );
    teams.push(team);
  }
  const unique = [
    ...new Map(names.map((name) => [name.toLowerCase(), name])).values(),
  ];
  if (!unique.length || unique.length > 500)
    throw invalid("Choose between 1 and 500 players per batch.");
  return { names:unique, teams };
}

export const participationNames = raw => participationRoster(raw).names;
