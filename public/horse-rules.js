import { HORSE_ROSTER } from "./horse-roster.js";

export const RACE_DURATION = 22000;
export const RACE_COUNTDOWN = 2500;
export const RACE_MODEL = 1;
export const TICKET_TYPES = [
  {
    id: "win",
    name: "Win",
    count: 1,
    rate: 0.8,
    description: "Pick the winner.",
  },
  {
    id: "place",
    name: "Place",
    count: 1,
    rate: 0.8,
    description: "Pick one runner to finish in the top three.",
  },
  {
    id: "bracket",
    name: "Bracket Quinella",
    count: 2,
    rate: 0.775,
    description: "Pick the brackets of the first two runners, in either order.",
  },
  {
    id: "quinella",
    name: "Quinella",
    count: 2,
    rate: 0.775,
    description: "Pick the first two runners, in either order.",
  },
  {
    id: "wide",
    name: "Wide (Quinella Place)",
    count: 2,
    rate: 0.775,
    description: "Pick any two runners in the top three, in either order.",
  },
  {
    id: "exacta",
    name: "Exacta",
    count: 2,
    rate: 0.75,
    description: "Pick first and second in the correct order.",
  },
  {
    id: "trio",
    name: "Trio",
    count: 3,
    rate: 0.75,
    description: "Pick the top three runners, in any order.",
  },
  {
    id: "trifecta",
    name: "Trifecta",
    count: 3,
    rate: 0.725,
    description: "Pick first, second and third in the correct order.",
  },
];
const invalid = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const pairKey = (values) => [...values].sort((a, b) => a - b).join("-");
const shuffled = (items, rand) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
export const decoratedHorse = (h) =>
  !h.fictional && (h.g1Wins >= 3 || h.hallOfFame);
export function horseStrength(h) {
  if (h.fictional || !h.recordKnown) return 1;
  return 1 + 0.6 * h.g1Wins + 0.08 * h.gradedWins + (h.hallOfFame ? 0.6 : 0);
}
export function makeRaceField(rand, roster = HORSE_ROSTER) {
  const champions = shuffled(roster.filter(decoratedHorse), rand).slice(0, 6);
  const others = shuffled(
    roster.filter((h) => !decoratedHorse(h)),
    rand,
  ).slice(0, 6);
  if (champions.length !== 6 || others.length !== 6)
    throw invalid("The racing roster is unavailable.", 503);
  return shuffled([...champions, ...others], rand).map((h, i) => {
    const form = 70 + rand(61);
    return {
      ...h,
      number: i + 1,
      bracket: i < 4 ? i + 1 : 5 + Math.floor((i - 4) / 2),
      form,
      weight: Math.round(horseStrength(h) * form * 100),
      decorated: decoratedHorse(h),
    };
  });
}
// Exact Plackett–Luce probabilities for every possible top-three order (12P3=1320).
// Quotes and finishing order use these same immutable strengths.
export function raceMarkets(field) {
  const m = Object.fromEntries(TICKET_TYPES.map((t) => [t.id, {}]));
  const add = (type, key, p) => (m[type][key] = (m[type][key] || 0) + p);
  const total = field.reduce((sum, h) => sum + h.weight, 0);
  for (const a of field) {
    add("win", a.number, a.weight / total);
    for (const b of field) {
      if (a === b) continue;
      const ab = ((a.weight / total) * b.weight) / (total - a.weight);
      add("exacta", `${a.number}-${b.number}`, ab);
      add("quinella", pairKey([a.number, b.number]), ab);
      add("bracket", pairKey([a.bracket, b.bracket]), ab);
      for (const c of field) {
        if (c === a || c === b) continue;
        const p = (ab * c.weight) / (total - a.weight - b.weight);
        add("trifecta", `${a.number}-${b.number}-${c.number}`, p);
        add("trio", pairKey([a.number, b.number, c.number]), p);
        for (const h of [a, b, c]) add("place", h.number, p);
        for (const pair of [
          [a, b],
          [a, c],
          [b, c],
        ])
          add("wide", pairKey(pair.map((h) => h.number)), p);
      }
    }
  }
  return m;
}
export function quoteHorseTicket(field, ticket, markets = raceMarkets(field)) {
  const type = TICKET_TYPES.find((t) => t.id === ticket.kind);
  if (!type) throw invalid("Choose a supported ticket type.");
  const picks = ticket.picks;
  if (
    !Array.isArray(picks) ||
    picks.length !== type.count ||
    picks.some((n) => !Number.isSafeInteger(n))
  )
    throw invalid("Choose every runner or bracket on the ticket.");
  if (type.id !== "bracket" && new Set(picks).size !== picks.length)
    throw invalid("Choose different runners.");
  const allowed = new Set(
    field.map((h) => (type.id === "bracket" ? h.bracket : h.number)),
  );
  if (picks.some((n) => !allowed.has(n)))
    throw invalid("Choose a runner or bracket in this race.");
  if (
    !Number.isSafeInteger(ticket.stake) ||
    ticket.stake < 100 ||
    ticket.stake > 100000 ||
    ticket.stake % 100
  )
    throw invalid("Tickets cost 100–100,000 credits in steps of 100.");
  const ordered = ["exacta", "trifecta"].includes(type.id),
    canonical = ordered ? [...picks] : [...picks].sort((a, b) => a - b),
    key = canonical.join("-"),
    probability = markets[type.id][key];
  if (!(probability > 0))
    throw invalid("That combination cannot occur in this race.");
  const oddsTenths = Math.max(
      10,
      Math.floor((type.rate / probability) * 10 + 1e-8),
    ),
    potentialPayout = Math.floor((ticket.stake * oddsTenths) / 10);
  if (!Number.isSafeInteger(potentialPayout))
    throw invalid("Choose a smaller ticket stake.");
  return {
    kind: type.id,
    picks: canonical,
    stake: ticket.stake,
    oddsTenths,
    probability,
    potentialPayout,
  };
}
export function quoteHorseCart(field, tickets) {
  if (!Array.isArray(tickets) || tickets.length < 1 || tickets.length > 20)
    throw invalid("Choose between 1 and 20 tickets.");
  const markets = raceMarkets(field),
    quoted = tickets.map((t) => {
      const q = quoteHorseTicket(field, t, markets);
      if (t.oddsTenths !== q.oddsTenths)
        throw invalid("Ticket odds changed. Review your tickets again.", 409);
      return q;
    });
  const stake = quoted.reduce((sum, t) => sum + t.stake, 0);
  if (stake > 100000)
    throw invalid("The total stake per race is limited to 100,000 credits.");
  return { tickets: quoted, stake };
}
export function drawRaceOrder(field, rand) {
  const pool = [...field],
    order = [];
  while (pool.length) {
    const total = pool.reduce((s, h) => s + h.weight, 0),
      roll = (rand(100000000) / 100000000) * total;
    let cumulative = 0,
      index = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      cumulative += pool[i].weight;
      if (roll < cumulative) {
        index = i;
        break;
      }
    }
    order.push(pool.splice(index, 1)[0].number);
  }
  return order;
}
export function horseTicketWins(ticket, order, field) {
  const first = order.slice(0, 2),
    top = order.slice(0, 3),
    p = ticket.picks;
  switch (ticket.kind) {
    case "win":
      return p[0] === order[0];
    case "place":
      return top.includes(p[0]);
    case "bracket":
      return (
        pairKey(p) ===
        pairKey(first.map((n) => field.find((h) => h.number === n).bracket))
      );
    case "quinella":
      return pairKey(p) === pairKey(first);
    case "wide":
      return p.every((n) => top.includes(n));
    case "exacta":
      return p.every((n, i) => n === first[i]);
    case "trio":
      return pairKey(p) === pairKey(top);
    case "trifecta":
      return p.every((n, i) => n === top[i]);
    default:
      return false;
  }
}
export function horsePayout(tickets, order, field) {
  const results = tickets.map((t) => ({
    ...t,
    won: horseTicketWins(t, order, field),
  }));
  return {
    tickets: results,
    payout: results.reduce(
      (sum, t) => sum + (t.won ? t.potentialPayout : 0),
      0,
    ),
  };
}
export function horseProgress(race, number, elapsed) {
  let hash = (race.animationSeed ^ Math.imul(number, 0x9e3779b1)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  hash = (hash ^ (hash >>> 16)) >>> 0;
  const rank = race.order.indexOf(number),
    duration = RACE_DURATION * (0.87 + rank * 0.011),
    t = Math.min(1, Math.max(0, elapsed / duration)),
    power = 0.8 + (hash / 4294967296) * 0.4;
  return Math.pow(t, power);
}
