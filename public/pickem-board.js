export function tourSummaries(matches, now) {
  const groups = new Map();
  for (const p of matches) {
    const key = p.event_id || -p.id;
    let g = groups.get(key);
    if (!g)
      groups.set(
        key,
        (g = {
          key,
          name: p.tour,
          matches: 0,
          rounds: new Set(),
          open: 0,
          settled: 0,
          nextEnds: null,
          newest: 0,
        }),
      );
    g.matches++;
    g.rounds.add(p.round || 1);
    g.newest = Math.max(g.newest, p.id);
    if (p.settled) g.settled++;
    else if (p.ends > now) {
      g.open++;
      g.nextEnds = g.nextEnds === null ? p.ends : Math.min(g.nextEnds, p.ends);
    }
  }
  return [...groups.values()]
    .map((g) => ({ ...g, rounds: g.rounds.size }))
    .sort((a, b) => b.newest - a.newest);
}
export function predictionDraft(p, draft) {
  return draft?.teamA === p.team_a && draft?.teamB === p.team_b
    ? draft
    : {
        teamA: p.team_a,
        teamB: p.team_b,
        winner: p.prediction || "",
        scoreA: p.prediction_a ?? "",
        scoreB: p.prediction_b ?? "",
      };
}
export function predictionBody(values) {
  if (!["a", "b"].includes(values.winner))
    throw Error("Choose a winning team.");
  if (
    [values.scoreA, values.scoreB].some(
      (v) => v === undefined || String(v).trim() === "",
    )
  )
    throw Error("Enter both predicted scores.");
  const pickem = Number(values.pickem),
    scoreA = Number(values.scoreA),
    scoreB = Number(values.scoreB);
  if (!Number.isSafeInteger(pickem) || pickem < 1)
    throw Error("Choose a match.");
  if (
    [scoreA, scoreB].some((v) => !Number.isSafeInteger(v) || v < 0 || v > 1000)
  )
    throw Error("Scores must be whole numbers from 0 to 1,000.");
  if (
    scoreA === scoreB ||
    (values.winner === "a" ? scoreA < scoreB : scoreB < scoreA)
  )
    throw Error("Scores must agree with the selected winner.");
  return { pickem, winner: values.winner, scoreA, scoreB };
}
export function pickemBoard(
  tours,
  detail,
  { escape: e, number: n, now, drafts = {}, signedIn = true },
) {
  const deadline = (p) =>
    new Date(p.ends).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Seoul",
    }) + " KST";
  const rows =
    detail?.matches
      .map((p) => {
        const open = !p.settled && p.ends > now,
          draft = predictionDraft(p, drafts[p.id]),
          form = "tour-prediction-" + p.id;
        const status = p.settled ? "Settled" : open ? "Open" : "Locked";
        const label = e(p.team_a + " vs " + p.team_b);
        return (
          '<tr class="pickem-table-row" title="' +
          e(
            deadline(p) +
              " · " +
              n(p.winner_reward) +
              " winner · " +
              n(p.score_reward) +
              " per exact team score",
          ) +
          '"><td class="round-number">' +
          (p.round || 1) +
          '</td><th scope="row" class="match-name">' +
          label +
          "</th><td>" +
          (open
            ? '<select name="winner" form="' +
              form +
              '" required aria-label="Winner: ' +
              label +
              '"><option value="">Choose…</option><option value="a" ' +
              (draft.winner === "a" ? "selected" : "") +
              ">" +
              e(p.team_a) +
              '</option><option value="b" ' +
              (draft.winner === "b" ? "selected" : "") +
              ">" +
              e(p.team_b) +
              "</option></select>"
            : p.prediction
              ? e(p.prediction === "a" ? p.team_a : p.team_b)
              : "—") +
          '</td><td class="pickem-score-cell">' +
          (open
            ? '<div class="pickem-score"><input name="scoreA" form="' +
              form +
              '" type="number" min="0" max="1000" step="1" required value="' +
              e(draft.scoreA) +
              '" aria-label="' +
              e(p.team_a) +
              ' predicted score"><span>:</span><input name="scoreB" form="' +
              form +
              '" type="number" min="0" max="1000" step="1" required value="' +
              e(draft.scoreB) +
              '" aria-label="' +
              e(p.team_b) +
              ' predicted score"></div>'
            : p.prediction
              ? p.prediction_a + " : " + p.prediction_b
              : "—") +
          '</td><td class="pickem-state" title="' +
          e(deadline(p)) +
          '"><span class="' +
          (open ? "ledger-positive" : "muted") +
          '">' +
          status +
          "</span>" +
          (p.settled
            ? "<small>" + p.result_a + " : " + p.result_b + "</small>"
            : "") +
          '</td><td class="pickem-confirm">' +
          (open
            ? '<form id="' +
              form +
              '" data-inline-prediction="' +
              p.id +
              '"><input type="hidden" name="pickem" value="' +
              p.id +
              '"><button class="button secondary" ' +
              (signedIn
                ? 'type="submit"'
                : 'type="button" data-action="account"') +
              ">" +
              (signedIn ? "Confirm" : "Sign in") +
              '</button><div class="form-error" role="alert"></div></form>'
            : p.prediction
              ? '<span class="form-hint">Submitted</span>'
              : "—") +
          "</td></tr>"
        );
      })
      .join("") || "";
  return (
    '<div class="pickem-tours">' +
    tours
      .map((t) => {
        const expanded = detail?.key === t.key;
        const label = t.open
          ? "OPEN"
          : t.settled === t.matches
            ? "SETTLED"
            : "LOCKED · awaiting results";
        let table = "";
        if (expanded) {
          const terms = [
            ...new Map(
              detail.matches.map((p) => [
                p.winner_reward + ":" + p.score_reward,
                [p.winner_reward, p.score_reward],
              ]),
            ).values(),
          ];
          const rewardText =
            terms.length === 1
              ? "✦ " +
                n(terms[0][0]) +
                " winner · ✦ " +
                n(terms[0][1]) +
                " per exact team score"
              : "Rewards vary by match; hover a match for details.";
          table =
            '<div class="tour-rounds" id="tour-rounds-' +
            t.key +
            '"><div class="pickem-table-note"><span>' +
            rewardText +
            "</span>" +
            (t.nextEnds
              ? "<span>Next deadline: " +
                e(deadline({ ends: t.nextEnds })) +
                "</span>"
              : "") +
            '</div><div class="table-wrap pickem-table-wrap"><table class="pickem-table"><thead><tr><th>Rd</th><th>Match</th><th>Your winner</th><th>Score A : B</th><th>Status / result</th><th>Save</th></tr></thead><tbody>' +
            rows +
            "</tbody></table></div>" +
            (detail.byes || [])
              .map(
                (b) =>
                  '<p class="form-hint">Round ' +
                  b.round +
                  " · " +
                  e(b.team) +
                  " receives a bye</p>",
              )
              .join("") +
            "</div>";
        }
        return (
          '<article class="pickem tour-card"><div class="tour-summary"><div><span class="eyebrow">TOUR PICK’EMS</span><h3>' +
          e(t.name) +
          '</h3><p class="form-hint">' +
          t.rounds +
          (t.rounds === 1 ? " round · " : " rounds · ") +
          t.matches +
          (t.matches === 1 ? " match · " : " matches · ") +
          t.open +
          " open · " +
          t.settled +
          ' settled</p></div><span class="pill ' +
          (t.open ? "live" : "") +
          '">' +
          label +
          '</span><button class="button secondary" data-action="pickem-tour" data-id="' +
          t.key +
          '" aria-expanded="' +
          expanded +
          '" aria-controls="tour-rounds-' +
          t.key +
          '">' +
          (expanded ? "Hide rounds ↑" : "View all rounds →") +
          "</button></div>" +
          table +
          "</article>"
        );
      })
      .join("") +
    "</div>"
  );
}
