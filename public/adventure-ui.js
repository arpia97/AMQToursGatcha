import {
  ROULETTE_DURATION,
  ROULETTE_POCKETS,
  ROULETTE_RETURNS,
  CLIMB_ENTRY,
  CLIMB_CHOICES,
  CLIMB_OPTIONS,
  CLIMB_PER_HEIGHT,
  climbOptionLabel,
  climbPayout,
  climbDistance,
  climbChange,
  climbInMetres,
} from "./pachinko-rules.js";
import { rouletteStopAngle } from "./roulette-motion.js";

const point = (r, a) => [
  200 + r * Math.cos((a * Math.PI) / 180),
  200 + r * Math.sin((a * Math.PI) / 180),
];
function wheel(pocket) {
  return `<svg viewBox="0 0 400 400" aria-hidden="true"><circle cx="200" cy="200" r="193" fill="#49302c" stroke="#ba8d4b" stroke-width="5"/><circle cx="200" cy="200" r="177" fill="#cfad62"/>${ROULETTE_POCKETS.map(
    (colour, i) => {
      const a = (i * 360) / 37 - 90,
        b = ((i + 1) * 360) / 37 - 90,
        p = point(171, a),
        q = point(171, b),
        x = point(126, b),
        y = point(126, a);
      return `<path class="roulette-pocket${i === pocket ? " is-result" : ""}" data-pocket="${i}" d="M${p} A171 171 0 0 1 ${q} L${x} A126 126 0 0 0 ${y} Z" fill="${{ red: "#c33450", black: "#171923", green: "#55ac78" }[colour]}" stroke="#b08a4d" stroke-width="1"/>`;
    },
  ).join(
    "",
  )}<circle cx="200" cy="200" r="122" fill="#352a30" stroke="#bd9559" stroke-width="4"/><circle cx="200" cy="200" r="25" fill="#bb8d4d"/>${[0, 120, 240].map((a) => `<path d="M200 200 L200 139" stroke="#dbb870" stroke-width="13" stroke-linecap="round" transform="rotate(${a} 200 200)"/>`).join("")}<circle cx="200" cy="200" r="12" fill="#f2d394"/></svg>`;
}
const climbPoint = (h) => ({
  x: 300 + Math.sin(h * 0.015) * (1 - h / 1000) * 60,
  y: 325 - h * 0.28,
});
function rouletteMotionControl(mode = "full") {
  return `<label class="roulette-motion">Animation<select class="roulette-motion-select" aria-label="Roulette Animation">${[
    ["full", "Full Animation"],
    ["system", "System Setting"],
    ["reduced", "Reduced Motion"],
  ]
    .map(
      ([value, label]) =>
        `<option value="${value}" ${mode === value ? "selected" : ""}>${label}</option>`,
    )
    .join("")}</select></label>`;
}
export function createAdventureUI({
  getState,
  escape: e,
  number: n,
  ui,
  now = Date.now,
  onFinish = async () => {},
}) {
  let timer;
  function roulette() {
    const s = getState(),
      g = s.roulette,
      spinning = g?.status === "spinning",
      draft = spinning
        ? { choice: g.choice, stake: g.stake }
        : ui.rouletteDraft || { choice: "red", stake: 100 };
    const end = g ? rouletteStopAngle(g.pocket) : 0,
      elapsed = spinning
        ? Math.max(0, Math.min(ROULETTE_DURATION, now() - g.startedAt))
        : 0;
    return `<section class="roulette-panel"><div class="section-head"><div><span class="eyebrow">RED · BLACK · GREEN</span><h2>Let the Wheel Decide.</h2></div><div class="roulette-controls">${rouletteMotionControl(ui.rouletteMotion)}<span class="pill ${spinning ? "live" : ""}">${spinning ? "SPINNING" : "PLACE YOUR BET"}</span></div></div><div class="roulette-board ${spinning ? "is-spinning" : g ? "is-complete" : ""}" data-roulette="${g?.id || ""}" style="--roulette-end:${end}deg;--roulette-elapsed:-${elapsed}ms;--roulette-duration:${ROULETTE_DURATION}ms"><div class="roulette-pointer" aria-hidden="true"><span>▼</span></div><div class="roulette-wheel ${spinning ? "is-spinning" : ""}">${wheel(g?.pocket)}</div><div class="roulette-ball-track ${spinning ? "is-spinning" : ""}" aria-hidden="true"><i></i></div></div><div class="roulette-outcome" role="status">${spinning ? "<strong>The wheel is spinning…</strong><p>Your selection is locked until it stops.</p>" : g ? `<strong class="roulette-${g.colour}">${e(g.colour[0].toUpperCase() + g.colour.slice(1))} · ${g.payout ? "You Win!" : "No Win This Time"}</strong><p>Bet ✦ ${n(g.stake)} · Returned ✦ ${n(g.payout)} · Net ${g.payout - g.stake > 0 ? "+" : ""}${n(g.payout - g.stake)}</p>` : "<strong>Choose Your Colour</strong><p>One green pocket. Eighteen red. Eighteen black.</p>"}</div>${Object.hasOwn(s, "roulette") ? `<form id="roulette-form"><fieldset class="roulette-choices" ${spinning ? "disabled" : ""}><legend class="sr-only">Choose a Colour</legend>${["red", "black", "green"].map((c) => `<label class="roulette-choice ${c}"><input type="radio" name="choice" value="${c}" ${draft.choice === c ? "checked" : ""} required><span>${c[0].toUpperCase() + c.slice(1)}<small>${ROULETTE_RETURNS[c]}× return · ${c === "green" ? "1" : "18"}/37 chance</small></span></label>`).join("")}</fieldset><div class="roulette-bet"><label>Bet (credits)<input type="number" name="stake" min="1" max="${Math.min(1000000, s.me?.balance ?? 1000000)}" step="1" value="${e(draft.stake)}" required ${spinning ? "disabled" : ""}></label><button type="submit" class="button mint" ${spinning ? "disabled" : ""}>${spinning ? "Spinning…" : s.me ? "Spin the wheel →" : "Sign in to play"}</button></div><div class="form-error" role="alert"></div></form>` : '<p class="notice">Roulette is updating. Please refresh in a moment.</p>'}${spinning ? '<button class="text-button" data-action="roulette-refresh">Check result</button>' : ""}<details class="mj-rules"><summary>Roulette Rules & Returns</summary><p>All 37 pockets are equally likely. Red and black each have 18 pockets and return 2× your stake on a win. Green has one pocket and returns 35×. Returns include the stake; a loss returns zero. Bets accept whole credits from 1 to 1,000,000 within your available balance. Your bet locks before the server chooses a pocket. Refreshing resumes the same spin, and completed spins pay once even if you leave.</p></details></section>`;
  }
  function climb() {
    const s = getState(),
      g = climbInMetres(s.climb),
      active = g?.status === "active",
      height = g?.height || 0,
      position = climbPoint(height),
      from = climbPoint(g?.last?.from ?? height),
      elapsed = g?.last ? Math.max(0, Math.min(1000, now() - g.last.at)) : 1000;
    const points = [0, ...(g?.moves || []).map((m) => m.to)]
      .map((h) => {
        const p = climbPoint(h);
        return p.x + "," + p.y;
      })
      .join(" ");
    return `<section class="climb-panel"><div class="section-head"><div><span class="eyebrow">TEN CHOICES · ONE CLIMB</span><h2>${g?.status === "complete" ? "Your Climb Is Complete." : "Choose Your Way Up."}</h2></div><span class="pill">${g?.moves.length || 0} / ${CLIMB_CHOICES} CHOICES</span></div><div class="climb-scene"><svg viewBox="0 0 600 370" role="img" aria-label="Your climber is at ${climbDistance(height)}"><defs><linearGradient id="climb-sky" x2="0" y2="1"><stop stop-color="#172b47"/><stop offset="1" stop-color="#567d83"/></linearGradient><linearGradient id="climb-rock" x2="1" y2="1"><stop stop-color="#789591"/><stop offset="1" stop-color="#273d4c"/></linearGradient></defs><rect width="600" height="370" rx="14" fill="url(#climb-sky)"/><circle cx="485" cy="65" r="27" fill="#ffe2a9" opacity=".8"/><path d="M0 300L130 120 265 300 440 110 600 310V370H0Z" fill="#324f64"/><path d="M80 345L300 25 520 345Z" fill="url(#climb-rock)"/><path d="M300 25L349 97 325 86 308 108 285 86 258 87Z" fill="#e0eee7"/><path d="M300 25L305 345H520Z" fill="#213741" opacity=".38"/><path d="M0 340Q130 318 300 344T600 340V370H0Z" fill="#273e3b"/><polyline points="${points}" fill="none" stroke="#c2f3d7" stroke-width="3" stroke-dasharray="5 6" opacity=".7"/><g class="climb-person ${g?.last ? "is-moving" : ""}" style="--from-x:${from.x}px;--from-y:${from.y}px;--to-x:${position.x}px;--to-y:${position.y}px;animation-delay:-${elapsed}ms"><ellipse cx="0" cy="5" rx="13" ry="4" fill="#10262b" opacity=".5"/><path d="M-2 -20L-8 -7 -13 0M-2 -20L6 -8 9 1M-2 -24L-12 -29 -17 -22M-2 -24L10 -30 15 -39" fill="none" stroke="#f2b56b" stroke-width="5" stroke-linecap="round"/><path d="M-6 -30L4 -29 2 -16 -7 -17Z" fill="#e6788c"/><rect x="-12" y="-29" width="7" height="12" rx="3" fill="#95d1bf"/><circle cx="-1" cy="-36" r="7" fill="#f5d8b1"/><path d="M-9 -38Q-5 -49 5 -41L7 -37Z" fill="#d3ab6b"/></g></svg>${g?.last ? `<span class="climb-roll ${g.last.delta < 0 ? "fall" : "gain"}" role="status">${climbChange(g.last.delta)}</span>` : ""}</div><div class="climb-stats"><div><small>HEIGHT</small><strong>${climbDistance(height)}</strong></div><div><small>${g?.status === "complete" ? "PAYOUT" : "CURRENT VALUE"}</small><strong>✦ ${n(climbPayout(height))}</strong></div><div><small>ENTRY FEE</small><strong>✦ ${n(CLIMB_ENTRY)}</strong></div></div>${
      active
        ? `<h3>Choose Your Next Route</h3><div class="climb-options">${g.offers
            .map((id) => {
              const o = CLIMB_OPTIONS[id];
              return `<button class="climb-option ${o.min === o.max ? "steady" : "random"}" data-action="climb-choose" data-option="${id}" data-game="${g.id}" data-version="${g.version}"><strong>${climbOptionLabel(id)}</strong><span>${o.min === o.max ? "100% · guaranteed" : "Random · " + (o.max - o.min + 1) + " equally likely values"}</span></button>`;
            })
            .join(
              "",
            )}</div><p class="form-hint">Choice ${g.moves.length + 1} of ${CLIMB_CHOICES}. All choices are free after entry; finish all ten to receive your final value.</p>`
        : g
          ? `<div class="climb-result" role="status"><h3>${g.payout >= g.stake ? "A Rewarding Climb!" : "Back at Base Camp."}</h3><p>Final height ${climbDistance(g.height)} · Returned ✦ ${n(g.payout)} · Net ${g.payout - g.stake > 0 ? "+" : ""}${n(g.payout - g.stake)}</p></div>`
          : '<p class="form-hint">Pay once, then choose one of three routes on each of ten turns. Safe steps and risky leaps lead to different heights.</p>'
    }${Object.hasOwn(s, "climb") && !active ? `<button class="button mint" data-action="climb-start" ${s.me && s.me.balance < CLIMB_ENTRY ? "disabled" : ""}>${s.me ? (g ? "Start another climb" : "Start climbing") + " · ✦ " + n(CLIMB_ENTRY) : "Sign in to climb"}</button>` : ""}${g?.moves.length ? `<div class="climb-history" aria-label="Your ten choices">${g.moves.map((m, i) => `<span title="Choice ${i + 1}: ${climbOptionLabel(m.option)} → ${climbDistance(m.to)}" class="${m.delta < 0 ? "fall" : "gain"}">${climbChange(m.delta)}</span>`).join("")}</div>` : ""}<details class="mj-rules"><summary>Climbing Rules & Payouts</summary><p>Entry is ${n(CLIMB_ENTRY)} credits. Each turn offers three distinct routes selected uniformly from the pool below. Routes can appear again on later turns; refreshing keeps your current three. Pick ten times. Every whole metre in a random range is equally likely, and height cannot fall below zero. Your final height pays ${CLIMB_PER_HEIGHT} credits per 10 m, rounded down to whole credits, up to 1,800 credits at 1,000 m. Payouts include the value recovered from your entry; net profit is the payout minus ${n(CLIMB_ENTRY)}. There are no additional choice fees or early cash-outs.</p><div class="climb-pool">${CLIMB_OPTIONS.map((o) => `<span>${climbOptionLabel(o.id)}${o.min === o.max ? " · 100%" : " · random"}</span>`).join("")}</div></details></section>`;
  }
  return {
    roulette,
    climb,
    mount() {
      clearTimeout(timer);
      const g = getState().roulette;
      if (document.querySelector("[data-roulette]") && g?.status === "spinning")
        timer = setTimeout(
          () => {
            Promise.resolve(onFinish()).catch(() => {});
          },
          Math.max(50, g.endsAt - now() + 50),
        );
    },
  };
}
