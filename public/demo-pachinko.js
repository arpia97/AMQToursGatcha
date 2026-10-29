import {
  ROULETTE_DURATION,
  ROULETTE_POCKETS,
  ROULETTE_RETURNS,
  CLIMB_ENTRY,
  CLIMB_CHOICES,
  CLIMB_OPTIONS,
  climbOffers,
  climbHeight,
  climbPayout,
  climbInMetres,
} from "./pachinko-rules.js";
// Explicit local demo only; production outcomes are generated and saved by the server.
export function demoPachinko(d, path, b) {
  const s = d.s,
    now = Date.now(),
    rand = (n) => Math.floor(Math.random() * n);
  s.roulette ??= null;
  s.climb ??= null;
  s.climb = climbInMetres(s.climb);
  s.gambling ||= [];
  const save = (g, kind) => {
    let row = s.gambling.find((r) => r.id === g.id && r.game === kind);
    if (!row) {
      row = { id: g.id, game: kind };
      s.gambling.push(row);
    }
    Object.assign(row, {
      stake: g.stake,
      payout: g.payout,
      net: g.payout - g.stake,
    });
  };
  const spin = s.roulette;
  if (spin?.status === "spinning" && spin.endsAt <= now) {
    spin.status = "complete";
    spin.version++;
    spin.colour = ROULETTE_POCKETS[spin.pocket];
    spin.payout =
      spin.colour === spin.choice
        ? spin.stake * ROULETTE_RETURNS[spin.choice]
        : 0;
    if (spin.payout) d.wallet(spin.payout, "Demo roulette win");
    save(spin, "roulette");
  }
  if (!path.startsWith("roulette-") && !path.startsWith("climb-"))
    return undefined;
  const kind = path.startsWith("roulette-") ? "roulette" : "climb",
    old = s[kind];
  if (path === "roulette-start" || path === "climb-start") {
    if (old && old.status !== "complete")
      throw Error("Finish your current game first.");
    if (b.previousGame !== (old?.id ?? null))
      throw Error("Your game changed. Refresh first.");
    const stake = kind === "roulette" ? b.stake : CLIMB_ENTRY;
    if (
      !Number.isSafeInteger(stake) ||
      stake < 1 ||
      stake > 1000000 ||
      (kind === "roulette" && !Object.hasOwn(ROULETTE_RETURNS, b.choice))
    )
      throw Error("Choose a valid bet.");
    d.wallet(
      -stake,
      kind === "roulette" ? "Demo roulette bet" : "Demo mountain entry",
    );
    const g = {
      id: (s.pachinkoSequence = (s.pachinkoSequence || 0) + 1),
      version: 0,
      stake,
      payout: 0,
      startedAt: now,
    };
    Object.assign(
      g,
      kind === "roulette"
        ? {
            status: "spinning",
            choice: b.choice,
            pocket: rand(37),
            endsAt: now + ROULETTE_DURATION,
          }
        : {
            status: "active",
            height: 0,
            distanceUnit: "m",
            offers: climbOffers(rand),
            moves: [],
            last: null,
          },
    );
    s[kind] = g;
    save(g, kind);
    return {
      message:
        kind === "roulette"
          ? "Your bet is locked. Spinning…"
          : "Your climb has begun.",
    };
  }
  const g = s.climb;
  if (
    path !== "climb-choose" ||
    !g ||
    g.status !== "active" ||
    b.game !== g.id ||
    b.version !== g.version ||
    !g.offers.includes(b.option)
  )
    throw Error("Choose one of your current routes.");
  const o = CLIMB_OPTIONS[b.option],
    delta = o.min + rand(o.max - o.min + 1),
    from = g.height;
  g.height = climbHeight(from, delta);
  g.version++;
  g.last = { option: o.id, delta, from, to: g.height, at: now };
  g.moves.push(g.last);
  if (g.moves.length === CLIMB_CHOICES) {
    g.status = "complete";
    g.offers = [];
    g.payout = climbPayout(g.height);
    if (g.payout) d.wallet(g.payout, "Demo mountain payout");
  } else g.offers = climbOffers(rand);
  save(g, "climb");
  return {
    message:
      g.status === "complete"
        ? "Climb complete. " + g.payout + " credits paid."
        : "Your next routes are ready.",
  };
}
