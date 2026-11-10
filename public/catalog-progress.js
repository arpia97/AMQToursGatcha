export function catalogProgress(s) {
  if (!s) return null;
  const count = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : 0);
  const scanned = count(s.scannedTitles),
    total = count(s.totalTitles) || null;
  const complete = s.discoveryComplete === true;
  return {
    scanned,
    total,
    percent: complete
      ? 100
      : total
        ? Math.min(99.99, Math.floor((scanned / total) * 10000) / 100)
        : null,
    complete,
    skipped: count(s.skippedTitles),
    status: ["running", "waiting", "paused", "completed"].includes(s.status)
      ? s.status
      : "idle",
    updatedAt: count(s.updatedAt) || null,
  };
}
export function catalogProgressHTML(
  p,
  escape = String,
  number = (v) => Number(v).toLocaleString("en-US"),
) {
  if (!p || p.complete || p.percent >= 100) return "";
  const percent =
    p.percent === null ? "Awaiting Scan Total" : p.percent.toFixed(2) + "%";
  return (
    '<section class="catalog-import-progress" aria-label="Catalogue import progress"><div><strong>Catalogue Import · ' +
    escape(percent) +
    "</strong><span>" +
    number(p.scanned) +
    (p.total ? " / " + number(p.total) : "") +
    " Anime Cast Pages Scanned</span></div>" +
    (p.percent === null
      ? ""
      : '<progress aria-label="Anime cast scan progress" max="100" value="' +
        p.percent +
        '"></progress>') +
    '<p class="form-hint">' +
    (p.complete
      ? "Initial cast scan complete."
      : p.status === "paused"
        ? "Import paused."
        : p.status === "waiting"
          ? "Waiting to resume the next scan."
          : "Importing gradually.") +
    " Progress measures anime cast pages, not the final number of cards." +
    (p.skipped
      ? " " + number(p.skipped) + " unavailable cast pages skipped."
      : "") +
    "</p></section>"
  );
}
