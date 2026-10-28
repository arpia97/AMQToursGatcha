import {
  TICKET_TYPES,
  raceMarkets,
  quoteHorseTicket,
  quoteHorseCart,
  horseProgress,
  RACE_DURATION,
} from "./horse-rules.js";

export function coveredHorseNumbers(field, tickets = []) {
  const covered = new Set();
  for (const ticket of tickets) {
    if (
      !TICKET_TYPES.some((type) => type.id === ticket.kind) ||
      !Array.isArray(ticket.picks)
    )
      continue;
    for (const horse of field)
      if (
        ticket.picks.includes(
          ticket.kind === "bracket" ? horse.bracket : horse.number,
        )
      )
        covered.add(horse.number);
  }
  return covered;
}

export function createHorseUI({
  getState,
  escape: e,
  number: n,
  now,
  onFinish,
}) {
  let owner = null,
    raceId = null,
    tickets = [],
    draft = { kind: "win", picks: [], stake: 100 },
    frame = null,
    notified = null,
    market = null;
  const typeName = (id) => TICKET_TYPES.find((t) => t.id === id)?.name || id;
  const odds = (tenths) => (tenths / 10).toFixed(1) + "×";
  const portrait = (h) =>
    `<img src="${e(h.image)}" alt="${e(h.name)}" width="40" height="40" loading="lazy">`;
  const welcomeFaces =
    '<div class="race-welcome-faces" aria-hidden="true"><img src="horse-portraits/haru-urara.png" alt="" width="72" height="72"><img src="horse-portraits/gold-ship.png" alt="" width="86" height="86"><img src="horse-portraits/kitasan-black.png" alt="" width="72" height="72"></div>';
  function sync() {
    const s = getState(),
      g = s.horseRace;
    if (owner !== s.me?.id || raceId !== g?.id) {
      owner = s.me?.id;
      raceId = g?.id;
      tickets = [];
      notified = null;
      draft = { kind: "win", picks: [], stake: 100 };
      market = g ? raceMarkets(g.field) : null;
    }
    return g;
  }
  function readDraft(values) {
    if (values.kind !== draft.kind)
      draft = {
        kind: values.kind,
        picks: [],
        stake: Number(values.stake) || 100,
      };
    else
      draft = {
        kind: values.kind,
        picks: Array.from(
          {
            length: TICKET_TYPES.find((t) => t.id === values.kind)?.count || 1,
          },
          (_, i) => Number(values["pick" + i]) || 0,
        ),
        stake: Number(values.stake),
      };
  }
  function ticketLabel(t, g) {
    const join = ["exacta", "trifecta"].includes(t.kind) ? " → " : " + ";
    return t.picks
      .map((p) =>
        t.kind === "bracket"
          ? "Bracket " + p
          : "#" + p + " " + g.field.find((h) => h.number === p).name,
      )
      .join(join);
  }
  function quoteMarkup(g) {
    let q = null;
    try {
      q = quoteHorseTicket(g.field, draft, market);
    } catch {}
    return q
      ? `<div><small>CHANCE</small><strong>${(q.probability * 100).toFixed(q.probability < 0.01 ? 3 : 1)}%</strong></div><div><small>FIXED ODDS</small><strong>${odds(q.oddsTenths)}</strong></div><div><small>RETURN IF WON</small><strong>✦ ${n(q.potentialPayout)}</strong></div><div><small>NET IF WON</small><strong>+${n(q.potentialPayout - q.stake)}</strong></div>`
      : "Choose your selection to see its fixed odds and payout.";
  }
  function track(g) {
    const covered = coveredHorseNumbers(
      g.field,
      g.status === "betting" ? tickets : g.tickets,
    );
    return `<section class="race-broadcast" aria-label="Animated race"><div class="race-broadcast-head"><div><span class="eyebrow">TOURS TURF · RACE ${g.id}</span><h2>${g.status === "betting" ? "The contenders are ready." : "And they’re off!"}</h2></div><span class="race-status" role="status">${g.status === "betting" ? "Tickets open" : "At the starting gates"}</span></div><div class="race-leaders" aria-label="Live leaders">${g.status === "betting" ? "12 runners · 6 decorated challengers · 6 from the rest of the field" : "Live positions appear as the race unfolds."}</div><div class="race-track-scroll"><div class="race-track">${g.field.map((h) => `<div class="race-lane${covered.has(h.number) ? " is-backed" : ""}"${covered.has(h.number) ? ' title="Backed by your tickets"' : ""}><span class="race-lane-name"><b class="race-gate bracket-${h.bracket}">${h.number}</b><span>${covered.has(h.number) ? '<span class="race-backed-mark" aria-label="Backed by your tickets">★</span> ' : ""}${e(h.name)}</span></span><div class="race-rail"><div class="race-runner" data-runner="${h.number}" style="--run:0;--silk:${e(h.color)}">${portrait(h)}<b>${h.number}</b><i aria-hidden="true"></i></div></div></div>`).join("")}</div></div><div class="race-distance"><span>START</span><span class="race-distance-readout">2,000 m · Turf</span><span>FINISH</span></div>${g.status === "running" ? '<button class="text-button race-refresh" type="button" data-action="horse-refresh" hidden>Refresh result →</button>' : ""}</section>`;
  }
  function runners(g) {
    return `<section class="race-runners"><div class="section-head"><div><h3>Race card</h3></div><span class="pill">ODDS LOCKED</span></div><div class="table-wrap"><table><thead><tr><th>Runner / bracket</th><th>Record & form</th><th>Win chance</th><th>Win return</th><th>Place return</th></tr></thead><tbody>${g.field
      .map((h) => {
        const win = quoteHorseTicket(
            g.field,
            { kind: "win", picks: [h.number], stake: 100 },
            market,
          ),
          place = quoteHorseTicket(
            g.field,
            { kind: "place", picks: [h.number], stake: 100 },
            market,
          );
        return `<tr><th scope="row"><div class="race-card-runner"><span class="race-gate bracket-${h.bracket}">${h.number}</span>${portrait(h)}<span>${e(h.name)}${h.decorated ? '<small class="race-champion">★ Decorated</small>' : ""}<small>Bracket ${h.bracket}</small></span></div></th><td><small>${h.fictional ? "Fictional · baseline" : h.recordKnown ? `${h.g1Wins} G1/Jpn1 · ${h.gradedWins} graded wins${h.hallOfFame ? " · Hall of Fame" : ""}` : "Unrated · baseline"}<br>Form ${h.form}%</small></td><td>${(win.probability * 100).toFixed(1)}%</td><td><strong>${odds(win.oddsTenths)}</strong></td><td><strong>${odds(place.oddsTenths)}</strong></td></tr>`;
      })
      .join("")}</tbody></table></div></section>`;
  }
  function betting(g) {
    const type =
      TICKET_TYPES.find((t) => t.id === draft.kind) || TICKET_TYPES[0];
    const options =
      type.id === "bracket"
        ? [...new Set(g.field.map((h) => h.bracket))].map((b) => ({
            value: b,
            label:
              `Bracket ${b} · ` +
              g.field
                .filter((h) => h.bracket === b)
                .map((h) => "#" + h.number)
                .join(", "),
          }))
        : g.field.map((h) => ({
            value: h.number,
            label: `#${h.number} ${h.name}`,
          }));
    const stake = tickets.reduce((sum, t) => sum + t.stake, 0);
    return `<section class="race-bets"><div class="section-head"><div><span class="eyebrow">THE TICKET DESK</span><h2>Make your picks.</h2></div></div><form id="horse-ticket-form" class="race-ticket-form"><label>Ticket type<select name="kind">${TICKET_TYPES.map((t) => `<option value="${t.id}" ${draft.kind === t.id ? "selected" : ""}>${t.name}</option>`).join("")}</select></label><p class="race-ticket-description">${type.description}</p><div class="race-pick-fields">${Array.from({ length: type.count }, (_, i) => `<label>${type.id === "bracket" ? "Bracket " + (i + 1) : ["exacta", "trifecta"].includes(type.id) ? ["1st place", "2nd place", "3rd place"][i] : "Runner " + (i + 1)}<select name="pick${i}" required><option value="">Choose…</option>${options.map((o) => `<option value="${o.value}" ${draft.picks[i] === o.value ? "selected" : ""}>${e(o.label)}</option>`).join("")}</select></label>`).join("")}<label>Stake (credits)<input name="stake" type="number" min="100" max="100000" step="100" value="${draft.stake}" required></label></div><div class="race-quote" aria-live="polite">${quoteMarkup(g)}</div><div class="form-error" role="alert"></div><button class="button secondary" type="submit" ${tickets.length >= 20 ? "disabled" : ""}>Add ticket +</button></form><div class="race-cart"><h3>Your tickets <span>${tickets.length}/20</span></h3>${tickets.length ? `<ol>${tickets.map((t, i) => `<li><div><strong>${e(typeName(t.kind))}</strong><span>${e(ticketLabel(t, g))}</span><small>✦ ${n(t.stake)} · ${odds(t.oddsTenths)} · returns ✦ ${n(t.potentialPayout)}</small></div><button type="button" class="text-button" data-action="horse-remove" data-index="${i}" aria-label="Remove ticket ${i + 1}">Remove</button></li>`).join("")}</ol>` : ""}<div class="race-cart-total"><span>Total stake <strong>✦ ${n(stake)}</strong></span><button type="button" class="button mint" data-action="horse-start" ${!tickets.length || stake > getState().me.balance || stake > 100000 ? "disabled" : ""}>Buy tickets & race →</button></div>${stake > getState().me.balance ? '<p class="form-error">Your wallet cannot cover these tickets.</p>' : ""}</div></section>`;
  }
  function result(g) {
    return `<section class="race-results"><span class="eyebrow">OFFICIAL RESULT</span><div class="race-podium">${g.order
      .slice(0, 3)
      .map((number, i) => {
        const h = g.field.find((h) => h.number === number);
        return `<div>${portrait(h)}<span>${["1st", "2nd", "3rd"][i]}</span><strong>#${number} ${e(h.name)}</strong></div>`;
      })
      .join(
        "",
      )}</div><div class="facet-summary complete"><div><small>TICKET PAYOUT</small><strong>✦ ${n(g.payout)}</strong></div><div><small>STAKED</small><strong>✦ ${n(g.stake)}</strong></div><div><small>NET RESULT</small><strong class="${g.payout >= g.stake ? "ledger-positive" : "ledger-negative"}">${g.payout - g.stake > 0 ? "+" : ""}${n(g.payout - g.stake)}</strong></div></div><div class="race-ticket-results">${g.tickets.map((t) => `<div><b class="${t.won ? "race-hit" : "muted"}">${t.won ? "WON" : "MISSED"}</b><span>${e(typeName(t.kind))} · ${e(ticketLabel(t, g))}</span><strong>✦ ${n(t.won ? t.potentialPayout : 0)}</strong></div>`).join("")}</div><details class="space-top"><summary>Full finishing order</summary><ol>${g.order.map((number) => `<li>#${number} ${e(g.field.find((h) => h.number === number).name)}</li>`).join("")}</ol></details><button class="button secondary space-top" data-action="horse-prepare">Meet the next runners →</button></section>`;
  }
  function rules() {
    return `<details class="mj-rules race-rules"><summary>Ticket guide & how odds work</summary><div class="table-wrap"><table><thead><tr><th>Ticket</th><th>Winning condition</th></tr></thead><tbody>${TICKET_TYPES.map((t) => `<tr><th>${t.name}</th><td>${t.description}</td></tr>`).join("")}</tbody></table></div><p>Every race has 12 runners, so Place pays for the top three. Bracket colors group runners into eight brackets. A same-bracket ticket is valid only when that bracket contains two runners. No dead heats or scratches are simulated.</p><p>Strength = 1 + 0.60 × career G1/Jpn1 wins + 0.08 × graded wins + 0.60 for JRA Hall of Fame, multiplied by race-day form (70–130%). Fictional and unrated runners use base strength 1. Six decorated runners (at least three G1/Jpn1 wins or Hall of Fame) and six other runners are drawn independently of strength; all within each group have an equal chance to appear.</p><p>Each finishing position is drawn from the remaining runners in proportion to their strengths. Win and combination probabilities use that same model. Fixed odds = return factor ÷ probability, rounded down to one decimal, with a 1.0× minimum. Return factors: Win/Place 80%; Bracket Quinella/Quinella/Wide 77.5%; Exacta/Trio 75%; Trifecta 72.5%. Payout includes your stake; credits round down. These are simulator odds, not live JRA odds or a betting pool.</p><p>The server locks tickets and the race result when purchased. The animation replays that result; refreshing, closing the page or switching games cannot change it. After the race ends, winnings are credited on your next state refresh or sign-in. Betting uses game credits.</p><p>Portraits © Cygames, supplied by you from <a href="https://gametora.com/umamusume/characters/profiles" target="_blank" rel="noopener">GameTora</a>. Career snapshot: October 28, 2026. <a href="https://jra.jp/gallery/dendo/index.html" target="_blank" rel="noopener">JRA Hall of Fame</a> · <a href="https://japanracing.jp/en/racing/go_racing/pdf/how_to_bet_en.pdf" target="_blank" rel="noopener">JRA ticket guide</a> · <a href="https://www.jra.go.jp/kouza/baken/" target="_blank" rel="noopener">JRA return rates</a>.</p></details>`;
  }
  return {
    render() {
      const g = sync();
      if (!getState().me)
        return (
          `<section class="race-welcome">${welcomeFaces}<span class="eyebrow">TOURS TURF</span><h2>Pick a champion. Back a long shot.</h2><p>Uma Musume portraits, 12 runners and eight ways to make your call.</p><button class="button mint" data-action="horse-prepare">Sign in to race →</button></section>` +
          rules()
        );
      if (!g)
        return (
          `<section class="race-welcome">${welcomeFaces}<span class="eyebrow">TOURS TURF</span><h2>A new field. A fresh chance.</h2><p>Meet twelve Uma Musume runners, compare their odds, and build your tickets before the gates open.</p><button class="button mint" data-action="horse-prepare">Meet the runners →</button><p class="form-hint">Preparing a field is free. You pay only for tickets.</p></section>` +
          rules()
        );
      if (g.status === "complete") return result(g) + rules();
      return (
        track(g) +
        (g.status === "betting"
          ? betting(g) + runners(g)
          : '<div class="notice race-in-progress">Your tickets are locked. Watch the race; your result is saved even if you leave.</div>') +
        rules()
      );
    },
    change(values) {
      readDraft(values);
    },
    quote() {
      const g = sync();
      return g ? quoteMarkup(g) : "";
    },
    add(values) {
      const g = sync();
      if (!g || g.status !== "betting") throw Error("Betting is closed.");
      readDraft(values);
      const q = quoteHorseTicket(g.field, draft, market);
      quoteHorseCart(g.field, [...tickets, q]);
      tickets.push(q);
    },
    remove(index) {
      if (Number.isSafeInteger(index) && index >= 0 && index < tickets.length)
        tickets.splice(index, 1);
    },
    purchase() {
      const g = sync();
      return {
        race: g.id,
        version: g.version,
        tickets: quoteHorseCart(g.field, tickets).tickets,
      };
    },
    mount() {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
      const g = getState()?.horseRace,
        board = document.querySelector(".race-broadcast");
      if (!board || g?.status !== "running") return;
      const runners = [...board.querySelectorAll("[data-runner]")],
        status = board.querySelector(".race-status"),
        leaders = board.querySelector(".race-leaders"),
        distance = board.querySelector(".race-distance-readout");
      let previousText = "";
      const tick = () => {
        if (!board.isConnected) return;
        const elapsed = now() - g.startsAt,
          positions = g.field
            .map((h) => ({ h, p: horseProgress(g, h.number, elapsed) }))
            .sort(
              (a, b) =>
                b.p - a.p ||
                g.order.indexOf(a.h.number) - g.order.indexOf(b.h.number),
            );
        for (const runner of runners)
          runner.style.setProperty(
            "--run",
            horseProgress(g, Number(runner.dataset.runner), elapsed),
          );
        const label =
          elapsed < 0
            ? "Gates open in " + Math.ceil(-elapsed / 1000) + "…"
            : elapsed < RACE_DURATION
              ? "Racing · " +
                Math.ceil((RACE_DURATION - elapsed) / 1000) +
                "s to finish"
              : "Race finished";
        if (label !== previousText) {
          status.textContent = label;
          previousText = label;
          leaders.textContent =
            elapsed < 0
              ? "Tickets closed · Get ready!"
              : positions
                  .slice(0, 4)
                  .map((x, i) => i + 1 + ". #" + x.h.number + " " + x.h.name)
                  .join("  ·  ");
          distance.textContent =
            Math.round(
              Math.min(1, Math.max(0, elapsed / RACE_DURATION)) * 2000,
            ) + " / 2,000 m";
        }
        if (now() >= g.endsAt) {
          board.querySelector(".race-refresh").hidden = false;
          if (notified !== g.id) {
            notified = g.id;
            Promise.resolve(onFinish()).catch(() => {
              status.textContent =
                "Race finished · refresh to collect your result";
            });
          }
          return;
        }
        frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
    },
  };
}
