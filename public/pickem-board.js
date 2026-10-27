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
export function pickemBoard(
  tours,
  detail,
  { escape: e, number: n, remaining, now },
) {
  const status = (p) =>
    p.settled
      ? "SETTLED"
      : p.ends <= now
        ? "LOCKED · awaiting results"
        : "OPEN";
  const deadline = (p) =>
    new Date(p.ends).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Seoul",
    }) + " KST";
  return `<div class="pickem-tours">${tours
    .map((t) => {
      const expanded = detail?.key === t.key;
      const label = t.open
        ? "OPEN"
        : t.settled === t.matches
          ? "SETTLED"
          : "LOCKED · awaiting results";
      let rounds = "";
      if (expanded) {
        const nums = [...new Set(detail.matches.map((p) => p.round || 1))].sort(
          (a, b) => a - b,
        );
        rounds = `<div class="tour-rounds" id="tour-rounds-${t.key}">${nums
          .map(
            (round) =>
              `<section class="tour-round"><h4>Round ${round}</h4>${detail.matches
                .filter((p) => (p.round || 1) === round)
                .map(
                  (p) =>
                    `<article class="pickem-row"><div><strong>${e(p.team_a)} <span class="muted">vs</span> ${e(p.team_b)}</strong><span class="form-hint">${p.settled ? `Result: ${p.result_a}–${p.result_b}` : e(p.title)}</span>${p.prediction ? `<span class="form-hint">Your pick: ${e(p.prediction === "a" ? p.team_a : p.team_b)} · ${p.prediction_a}–${p.prediction_b}</span>` : ""}</div><div><span class="pill ${!p.settled && p.ends > now ? "live" : ""}">${status(p)}</span><span class="form-hint">${!p.settled && p.ends > now ? remaining(p.ends) + " · " : ""}${deadline(p)}</span></div><div class="form-hint">✦ ${n(p.winner_reward)} winner<br>✦ ${n(p.score_reward)} per exact score</div>${!p.settled && p.ends > now ? `<button class="button secondary" data-action="predict" data-id="${p.id}">${p.prediction ? "Edit pick" : "Predict"} →</button>` : ""}</article>`,
                )
                .join("")}${(detail.byes || [])
                .filter((b) => b.round === round)
                .map((b) => `<p class="form-hint">${e(b.team)} · bye</p>`)
                .join("")}</section>`,
          )
          .join("")}</div>`;
      }
      return `<article class="pickem tour-card"><div class="tour-summary"><div><span class="eyebrow">TOUR PICK’EMS</span><h3>${e(t.name)}</h3><p class="form-hint">${t.rounds} round${t.rounds === 1 ? "" : "s"} · ${t.matches} match${t.matches === 1 ? "" : "es"} · ${t.open} open · ${t.settled} settled</p></div><span class="pill ${t.open ? "live" : ""}">${label}</span><button class="button secondary" data-action="pickem-tour" data-id="${t.key}" aria-expanded="${expanded}" aria-controls="tour-rounds-${t.key}">${expanded ? "Hide rounds ↑" : "View all rounds →"}</button></div>${rounds}</article>`;
    })
    .join("")}</div>`;
}
