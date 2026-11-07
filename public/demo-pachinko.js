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
import {
  blackjackShoe,
  blackjackNatural,
  blackjackTotal,
  blackjackSettlement,
} from "./blackjack-rules.js";
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
  if (path.startsWith("blackjack-")) {
    let g = s.blackjack;
    const finish = () => {
      Object.assign(g, blackjackSettlement(g), {
        status: "complete",
        version: g.version + 1,
        finishedAt: now,
      });
      if (g.payout) d.wallet(g.payout, "67 Blackjack: " + g.result);
      save(g, "blackjack67");
    };
    if (path === "blackjack-start") {
      if (g?.status === "active")
        throw Error("Finish your current hand first.");
      if (b.previousGame !== (g?.id ?? null))
        throw Error("Your hand changed. Refresh first.");
      if (!Number.isSafeInteger(b.stake) || b.stake < 1 || b.stake > 1000000)
        throw Error("Choose a whole-credit stake from 1 to 1,000,000.");
      d.wallet(-b.stake, "67 Blackjack: bet");
      const shoe = blackjackShoe(rand);
      g = {
        id: (s.blackjackCounter = (s.blackjackCounter || 0) + 1),
        status: "active",
        version: 0,
        stake: b.stake,
        payout: 0,
        shoe,
        hand: [shoe.pop()],
        dealer: [shoe.pop()],
        startedAt: now,
      };
      g.hand.push(shoe.pop());
      g.dealer.push(shoe.pop());
      s.blackjack = g;
      if (blackjackNatural(g.hand) || blackjackNatural(g.dealer)) finish();
      else save(g, "blackjack67");
    } else {
      if (
        !g ||
        g.status !== "active" ||
        b.game !== g.id ||
        b.version !== g.version
      )
        throw Error("Your hand changed. Refresh first.");
      if (path === "blackjack-hit") {
        g.hand.push(g.shoe.pop());
        g.version++;
      } else if (path !== "blackjack-stand")
        throw Error("Unknown game action.");
      if (path === "blackjack-stand" || blackjackTotal(g.hand).total >= 67)
        finish();
      else save(g, "blackjack67");
    }
    return { message: "Demo hand saved." };
  }
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
