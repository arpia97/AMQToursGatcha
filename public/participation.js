const invalid = (message) => Object.assign(new Error(message), { status: 400 });
export function participationNames(raw) {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 60000)
    throw invalid("Paste the tour’s team results (up to 60,000 characters).");
  const names = [];
  for (const [i, line] of raw.trim().split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const roster = line.split("|")[0].trim();
    let end = 0,
      count = 0;
    const pattern = /([^()]+?)\s*\((-?\d+(?:\.\d+)?)\)/g;
    for (const m of roster.matchAll(pattern)) {
      if (m.index !== end || !m[1].trim() || m[1].trim().length > 100)
        throw invalid(
          `Cannot read the players on line ${i + 1}. Use name (score) entries.`,
        );
      names.push(m[1].trim());
      end = m.index + m[0].length;
      count++;
    }
    if (!count || roster.slice(end).trim())
      throw invalid(
        `Cannot read the players on line ${i + 1}. Use name (score) entries.`,
      );
  }
  const unique = [
    ...new Map(names.map((name) => [name.toLowerCase(), name])).values(),
  ];
  if (!unique.length || unique.length > 500)
    throw invalid("Choose between 1 and 500 players per batch.");
  return unique;
}
