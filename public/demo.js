import { premiumPool, drawPremium } from "./pack-odds.js";
// Explicit browser-only sandbox. The production API never reads this state.
import { demoFeatures } from "./demo-features.js";
const KEY = "amqtours-demo-v2";
export class Demo {
  static async create() {
    const cards = await (await fetch("sample-catalog.json")).json();
    return new Demo(cards);
  }
  constructor(cards) {
    this.cards = cards;
    try {
      this.s = JSON.parse(localStorage.getItem(KEY));
    } catch {}
    if (!this.s) this.reset();
    this.s.catalog = cards;
  }
  reset() {
    const now = Date.now();
    const me = {
      id: "demo-001",
      name: "Collector",
      balance: 2800,
      earned: 12500,
      daily: null,
    };
    me.avatar_card = this.cards[1].id;
    this.s = {
      now,
      me,
      catalog: this.cards,
      settings: { character_price: 500, seiyuu_price: 500, main_weight: 80 },
      inventory: [
        { player: me.id, card: this.cards[0].id, copies: 3, level: 1 },
        { player: me.id, card: this.cards[1].id, copies: 1, level: 2 },
      ],
      ledger: [
        {
          delta: 800,
          reason: "participation: Friday Usual Tour",
          at: now - 86400000,
        },
      ],
      ranks: [
        { id: "demo-002", name: "Lunar", earned: 28400 },
        { id: "demo-003", name: "Haruki", earned: 21850 },
        { id: "demo-004", name: "Mochi", earned: 16700 },
        me,
        { id: "demo-005", name: "Kaze", earned: 9800 },
      ],
      auctions: [],
      pickems: [
        {
          id: 1,
          title: "Friday finals · who takes the tour?",
          tour: "USUAL TOUR",
          team_a: "Opening Theory",
          team_b: "Ending Credits",
          ends: now + 86400000,
          winner_reward: 300,
          score_reward: 100,
          settled: 0,
        },
      ],
      counts: { players: 48, cards: this.cards.length },
      history: {
        "demo-001": {
          aliases: ["collector", "amqcollector"],
          usernames: ["Collector"],
        },
        "demo-002": {
          aliases: ["lunaramq", "moonquizz"],
          usernames: ["Lunar", "Moonlight"],
        },
        "demo-003": { aliases: ["harukiamq"], usernames: ["Haruki"] },
        "demo-004": { aliases: ["mochiamq"], usernames: ["Mochi"] },
        "demo-005": { aliases: ["kazeamq"], usernames: ["Kaze"] },
      },
    };
    for (const kind of ["character", "seiyuu"])
      for (const [i, c] of this.cards
        .filter((c) => c.kind === kind)
        .slice(0, 5)
        .entries())
        this.s.auctions.push({
          id: this.s.auctions.length + 1,
          card: c.id,
          kind,
          starts: now - 86400000,
          ends: now + 3 * 86400000,
          bid: [250, 450, 320, 180, 600][i],
          winner: "demo-002",
          winner_name: "Lunar",
          claimed: 0,
        });
    this.save();
  }
  save() {
    localStorage.setItem(KEY, JSON.stringify(this.s));
  }
  wallet(delta, reason, earned = false) {
    if (this.s.me.balance + delta < 0)
      throw new Error("Not enough available credits.");
    this.s.me.balance += delta;
    if (earned) this.s.me.earned += delta;
    this.s.ledger.unshift({ delta, reason, at: Date.now() });
  }
  add(card) {
    const item = this.s.inventory.find((i) => i.card === card);
    if (item) item.copies++;
    else
      this.s.inventory.push({
        player: this.s.me.id,
        card,
        copies: 1,
        level: 1,
        acquired_at: Date.now(),
      });
  }
  async request(path, b) {
    const s = this.s;
    s.now = Date.now();
    const extra = demoFeatures(this, path, b);
    if (extra !== undefined) {
      this.save();
      return structuredClone(extra);
    }
    if (path.startsWith("catalog?")) {
      const p = new URLSearchParams(path.split("?")[1]),
        kind = p.get("kind") || "character",
        q = (p.get("q") || "").toLowerCase(),
        page = Number(p.get("page") || 1);
      const cards = s.catalog.filter(
        (c) =>
          c.kind === kind &&
          [c.name, c.series, c.series_romaji, c.series_english]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q),
      );
      return {
        cards: cards.slice((page - 1) * 40, page * 40),
        page,
        total: cards.length,
        hasMore: cards.length > page * 40,
      };
    }
    if (path === "state") return structuredClone(s);
    if (path.startsWith("profiles?")) {
      const params = new URLSearchParams(path.split("?")[1]),
        q = (params.get("q") || "").toLowerCase(),
        page = Number(params.get("page") || 1);
      const rows = s.ranks
        .filter((p) =>
          [
            p.id,
            p.name,
            ...s.history[p.id].aliases,
            ...s.history[p.id].usernames,
          ].some((n) => n.toLowerCase().includes(q)),
        )
        .map((p) => ({
          ...p,
          avatar_card: p.id === s.me.id ? s.me.avatar_card : this.cards[2].id,
          avatar_level:
            p.id === s.me.id
              ? s.inventory.find((i) => i.card === s.me.avatar_card)?.level
              : 6,
        }));
      return {
        profiles: rows.slice((page - 1) * 50, page * 50),
        total: rows.length,
        page,
        limit: 50,
        hasMore: rows.length > page * 50,
      };
    }
    if (path.startsWith("player?")) {
      const id = new URLSearchParams(path.split("?")[1]).get("id"),
        p = s.ranks.find((p) => p.id === id);
      if (!p) throw new Error("Player not found.");
      const mine = id === s.me.id;
      return {
        ...p,
        balance: mine ? s.me.balance : 7400,
        avatar_card: mine ? s.me.avatar_card : this.cards[2].id,
        ...s.history[id],
        stats: {
          participation: 24,
          counting: 7,
          reporting: 12,
          pickems: { total: 20, correct: 14 },
        },
        inventory: mine
          ? s.inventory
          : [
              { card: this.cards[2].id, copies: 1, level: 6 },
              { card: this.cards[11].id, copies: 1, level: 10 },
            ],
      };
    }
    if (path === "logout")
      throw new Error(
        "This is a demo account. Live sign-in is available on the deployed backend.",
      );
    if (path === "daily") {
      const day = new Date(s.now + 9 * 3600000).toISOString().slice(0, 10);
      if (s.me.daily === day) throw new Error("Already claimed today.");
      this.wallet(100, "Daily login", true);
      s.me.daily = day;
    } else if (path === "pack") {
      const pool = s.catalog.filter((c) => c.kind === b.kind);
      const enhanced = b.premium ? premiumPool(pool) : null;
      this.wallet(
        -s.settings[(b.premium ? "premium_" : "") + b.kind + "_price"],
        `${b.premium ? "Premium " : ""}${b.kind} pack`,
      );
      const rand = (n) => Math.floor(Math.random() * n);
      const cards = Array.from({ length: 5 }, () =>
        enhanced ? drawPremium(enhanced, rand) : pool[rand(pool.length)],
      );
      cards.forEach((c) => this.add(c.id));
      this.save();
      return { message: "Five new demo cards.", cards };
    } else if (path === "profile") {
      if (b.username !== undefined) {
        const name = b.username.trim();
        if (!name || name.length > 32 || !/^[\p{L}\p{N}_ .-]+$/u.test(name))
          throw new Error(
            "Choose a username with 1–32 letters, numbers, spaces, dots, hyphens, or underscores.",
          );
        if (
          s.ranks.some(
            (p) =>
              p.id !== s.me.id &&
              [
                p.name,
                ...s.history[p.id].aliases,
                ...s.history[p.id].usernames,
              ].some((n) => n.toLowerCase() === name.toLowerCase()),
          )
        )
          throw new Error(
            "That name is reserved by an AMQ alias or another player.",
          );
        if (!s.history[s.me.id].usernames.includes(name))
          s.history[s.me.id].usernames.push(name);
        s.me.name = name;
      }
      if (b.avatar !== undefined) {
        if (b.avatar !== null && !s.inventory.some((i) => i.card === b.avatar))
          throw new Error("Choose a card from your inventory.");
        s.me.avatar_card = b.avatar;
      }
    } else if (path === "bid") {
      const a = s.auctions.find((a) => a.id === b.auction);
      if (
        a.ends <= s.now ||
        !Number.isSafeInteger(b.amount) ||
        b.amount <= a.bid
      )
        throw new Error(
          "Enter a higher whole-number bid before the auction ends.",
        );
      this.wallet(
        -(b.amount - (a.winner === s.me.id ? a.bid : 0)),
        "Auction bid held",
      );
      a.bid = b.amount;
      a.winner = s.me.id;
    } else if (path === "enhance") {
      const i = s.inventory.find((i) => i.card === b.card),
        cost = 2 ** (i.level - 1);
      if (i.copies - 1 < cost || i.level >= 20)
        throw new Error("Not enough duplicate cards.");
      i.copies -= cost;
      i.level++;
    } else if (path === "predict") {
      const p = s.pickems.find((p) => p.id === b.pickem);
      if (s.now >= p.ends) throw new Error("Predictions closed.");
      if (
        !Number.isSafeInteger(b.scoreA) ||
        !Number.isSafeInteger(b.scoreB) ||
        b.scoreA < 0 ||
        b.scoreB < 0 ||
        b.scoreA > 1000 ||
        b.scoreB > 1000 ||
        b.scoreA === b.scoreB ||
        (b.winner === "a") !== b.scoreA > b.scoreB
      )
        throw new Error("Scores must agree with the selected winner.");
      p.prediction = b.winner;
      p.prediction_a = b.scoreA;
      p.prediction_b = b.scoreB;
    } else if (path === "claim") {
      const a = s.auctions.find((a) => a.id === b.auction);
      if (!a || a.ends > s.now || a.winner !== s.me.id || a.claimed)
        throw new Error("This auction cannot be claimed.");
      this.add(a.card);
      a.claimed = 1;
      s.auctions = s.auctions.filter((x) => x.id !== a.id);
    } else throw new Error("This action is available on the live backend.");
    const rank = s.ranks.find((x) => x.id === s.me.id);
    rank.earned = s.me.earned;
    rank.name = s.me.name;
    s.ranks.sort((a, b) => b.earned - a.earned);
    this.save();
    return {
      message:
        path === "daily"
          ? "100 demo credits claimed."
          : path === "bid"
            ? "Your demo bid is in the lead."
            : path === "predict"
              ? "Demo prediction saved."
              : path === "profile"
                ? "Demo profile updated."
                : "Updated your demo collection.",
    };
  }
}
