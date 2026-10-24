import { cardComparator } from "./card-display.js";
// Browser-only examples. The shared economy never reads this state.
export function demoFeatures(d, path, b) {
  const s = d.s,
    me = s.me,
    now = Date.now();
  if (!s.featureVersion) {
    s.featureVersion = 1;
    s.showcase = s.inventory.slice(0, 2).map((i) => i.card);
    s.gambling = [];
    s.market = [
      {
        id: 1,
        card: d.cards[2].id,
        kind: "character",
        seller: "demo-002",
        seller_name: "Lunar",
        level: 2,
        price: 350,
        status: "open",
      },
    ];
    s.shop = d.cards
      .filter((c) => c.kind === "character")
      .slice(0, 5)
      .concat(d.cards.filter((c) => c.kind === "seiyuu").slice(0, 5))
      .map((c, i) => ({
        id: i + 1,
        card: c.id,
        kind: c.kind,
        price: 400,
        ends: now + 4 * 86400000,
        buyer: null,
      }));
    s.auctions.push({
      id: 1001,
      card: d.cards[3].id,
      kind: "character",
      seller: "demo-002",
      seller_name: "Lunar",
      level: 3,
      reserve: 300,
      bid: 0,
      winner: null,
      starts: now,
      ends: now + 3 * 86400000,
      claimed: 0,
    });
    const p = s.pickems[0];
    if (p) {
      p.id = 3;
      s.pickems.push(
        {
          ...p,
          id: 2,
          title: "Saturday semifinal",
          ends: now - 3600000,
          prediction: null,
        },
        {
          ...p,
          id: 1,
          title: "Last week’s final",
          ends: now - 4 * 86400000,
          settled: 1,
          result_a: 2,
          result_b: 1,
          prediction: null,
        },
      );
    }
  }
  if (!s.shopMixVersion) {
    const pool = [...d.cards];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const prices = {
      AG: 25600,
      Ubers: 12800,
      SSS: 6400,
      SS: 3200,
      S: 1600,
      A: 800,
      B: 400,
      C: 200,
      D: 100,
    };
    s.shop = pool
      .slice(0, 10)
      .map((c, i) => ({
        id: i + 1,
        card: c.id,
        kind: c.kind,
        price: prices[c.rarity] || 100,
        ends: now + 4 * 86400000,
        buyer: null,
      }));
    s.shopMixVersion = 1;
  }
  s.settings.premium_character_price ??= 2000;
  if (!s.starterGranted) {
    d.wallet(1000, "Starting credits", true);
    s.starterGranted = true;
  }
  s.pinnedAnime ||= [];
  if (path === "state") {
    s.myListings = [
      ...s.market
        .filter((l) => l.seller === me.id && l.status === "open")
        .map((l) => ({ ...l, venue: "shop" })),
      ...s.auctions
        .filter((a) => a.seller === me.id && !a.closed && a.ends > now)
        .map((a) => ({ ...a, venue: "auction" })),
    ];
  }
  if (["state", "daily", "daily-pack"].includes(path)) {
    const day = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
    if (path === "daily-pack") {
      if (me.daily_pack === day) throw Error("Already claimed today.");
      const cards = Array.from(
        { length: 5 },
        () => d.cards[Math.floor(Math.random() * d.cards.length)],
      );
      cards.forEach((c) => d.add(c.id));
      me.daily_pack = day;
      return { cards, message: "Daily pack claimed.", credits: 0 };
    }
    let reward = null;
    if (me.daily !== day) {
      d.wallet(100, "Daily login", true);
      me.daily = day;
      reward = { message: "100 daily credits added.", credits: 100, cards: [] };
    }
    if (path === "daily") {
      if (!reward) throw Error("Already claimed today.");
      return reward;
    }
    s.loginReward = reward;
  }
  function animeGroups(owner = me.id) {
    const inv = owner === me.id ? s.inventory : [{ card: d.cards[2].id }],
      ids = new Set(inv.map((i) => i.card)),
      groups = new Map();
    if (owner === me.id) for (const l of s.myListings || []) ids.add(l.card);
    for (const c of d.cards.filter((c) => c.kind === "character")) {
      const title = c.series_romaji || c.series,
        key = title.trim().toLowerCase();
      if (!groups.has(key))
        groups.set(key, {
          series_key: key,
          series_romaji: title,
          series_english: c.series_english || "",
          owned: 0,
          total: 0,
        });
      const g = groups.get(key);
      g.total++;
      if (ids.has(c.id)) g.owned++;
    }
    return [...groups.values()];
  }
  if (path === "pin-anime") {
    if (b.pinned) {
      if (s.pinnedAnime.length >= 12) throw Error("Pin up to 12 anime.");
      if (!s.pinnedAnime.includes(b.series)) s.pinnedAnime.push(b.series);
    } else s.pinnedAnime = s.pinnedAnime.filter((k) => k !== b.series);
    return { message: b.pinned ? "Anime pinned." : "Anime unpinned." };
  }
  if (path.startsWith("anime-search?")) {
    const q = (
      new URLSearchParams(path.split("?")[1]).get("q") || ""
    ).toLowerCase();
    return {
      series: animeGroups().filter((g) =>
        (g.series_romaji + " " + g.series_english).toLowerCase().includes(q),
      ),
    };
  }
  if (path.startsWith("anime-collection?")) {
    const groups = animeGroups();
    return {
      series: groups.filter((g) => g.owned).sort((a, b) => b.owned - a.owned),
      pinned: groups.filter((g) => s.pinnedAnime.includes(g.series_key)),
      page: 1,
      hasMore: false,
      indexing: false,
    };
  }

  s.settings.premium_seiyuu_price ??= 2000;
  s.activePickem =
    s.pickems
      .filter((p) => !p.settled && p.ends > now)
      .sort((a, b) => b.id - a.id)[0] || null;
  function add(card, level = 1) {
    d.add(card);
    const i = s.inventory.find((i) => i.card === card);
    i.level = Math.max(i.level, level);
  }
  function take(id, variant) {
    const i = s.inventory.find((i) => i.card === id);
    if (!i) throw Error("You do not own that card.");
    if (variant === "extra" && i.copies < 2)
      throw Error("No extra copy is available.");
    const level = variant === "extra" ? 1 : i.level;
    i.copies--;
    if (variant === "card") i.level = 1;
    if (!i.copies) {
      s.inventory = s.inventory.filter((x) => x !== i);
      s.showcase = s.showcase.filter((c) => c !== id);
      if (me.avatar_card === id) me.avatar_card = null;
    }
    return level;
  }
  function completion(inv, owner) {
    const ids = new Set(inv.map((i) => i.card));
    if (owner === me.id) {
      for (const l of s.market.filter(
        (l) => l.status === "open" && l.seller === owner,
      ))
        ids.add(l.card);
      for (const a of s.auctions.filter(
        (a) => a.seller === owner && a.ends > now && !a.closed,
      ))
        ids.add(a.card);
    }
    return Object.fromEntries(
      ["character", "seiyuu"].map((kind) => {
        const total = d.cards.filter((c) => c.kind === kind).length,
          owned = [...ids].filter(
            (id) => d.cards.find((c) => c.id === id)?.kind === kind,
          ).length;
        return [kind, { owned, total, percent: (owned * 100) / total }];
      }),
    );
  }
  if (path.startsWith("rankings?")) {
    const p = new URLSearchParams(path.split("?")[1]),
      metric = p.get("metric") || "earned";
    const won = s.gambling.reduce((n, g) => n + Math.max(g.net, 0), 0),
      lost = s.gambling.reduce((n, g) => n + Math.max(-g.net, 0), 0);
    const rows = s.ranks
      .map((p) => {
        const own = p.id === me.id;
        return {
          ...p,
          value:
            metric === "earned"
              ? own
                ? me.earned
                : p.earned
              : metric === "balance"
                ? own
                  ? me.balance
                  : Math.floor(p.earned / 3)
                : own
                  ? metric === "gambling_won"
                    ? won
                    : lost
                  : 0,
        };
      })
      .filter((p) => p.value > 0)
      .sort((a, b) => b.value - a.value);
    return {
      rows: rows.map((p, i) => ({
        ...p,
        rank: rows.findIndex((x) => x.value === p.value) + 1,
      })),
      page: 1,
      hasMore: false,
    };
  }
  if (path.startsWith("pickems?"))
    return {
      pickems: [...s.pickems].sort((a, b) => b.id - a.id),
      page: 1,
      hasMore: false,
    };
  if (path.startsWith("market?")) {
    const p = new URLSearchParams(path.split("?")[1]),
      kind = p.get("kind"),
      auction = p.get("venue") === "auction";
    return {
      items: (auction
        ? s.auctions.filter((a) => a.seller && !a.closed && a.ends > now)
        : s.market.filter((l) => l.status === "open")
      ).filter((x) => x.kind === kind),
      cards: d.cards,
      page: 1,
      hasMore: false,
    };
  }
  if (path.startsWith("catalog?")) {
    const p = new URLSearchParams(path.split("?")[1]),
      q = (p.get("q") || "").toLowerCase(),
      kind = p.get("kind"),
      role = p.get("role"),
      grade = p.get("rarity");
    const all = d.cards.filter(
        (c) =>
          c.kind === kind &&
          (!role || c.role === role) &&
          (!grade || (c.rarity || "Pending") === grade) &&
          [c.name, c.series, c.series_romaji, c.series_english]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q),
      ),
      page = Number(p.get("page") || 1);
    all.sort(cardComparator(p.get("sort") || "name"));
    return {
      cards: all.slice((page - 1) * 40, page * 40),
      page,
      total: all.length,
      hasMore: all.length > page * 40,
    };
  }
  if (path.startsWith("player?")) {
    const id = new URLSearchParams(path.split("?")[1]).get("id"),
      p = id === me.id ? me : s.ranks.find((p) => p.id === id);
    if (!p) throw Error("Player not found.");
    const mine = id === me.id,
      inventory = mine
        ? s.inventory
        : [
            { card: d.cards[2].id, copies: 1, level: 6 },
            { card: d.cards[11].id, copies: 1, level: 10 },
          ];
    return {
      ...p,
      balance: mine ? me.balance : 7400,
      ...s.history[id],
      avatar_card: mine ? me.avatar_card : d.cards[2].id,
      stats: {
        participation: 24,
        counting: 7,
        reporting: 12,
        pickems: { total: 20, correct: 14 },
      },
      inventory,
      cards: d.cards,
      showcase: mine
        ? s.showcase
            .map((card) => inventory.find((i) => i.card === card))
            .filter(Boolean)
        : inventory,
      completion: completion(inventory, id),
      pinnedAnime: animeGroups(id).filter((g) =>
        mine ? s.pinnedAnime.includes(g.series_key) : false,
      ),
    };
  }
  if (path === "showcase") {
    if (
      b.cards.length > 6 ||
      b.cards.some((id) => !s.inventory.some((i) => i.card === id))
    )
      throw Error("Choose up to six owned cards.");
    s.showcase = [...b.cards];
    return { message: "Demo showcase updated." };
  }
  if (path === "list-card") {
    if (!Number.isSafeInteger(b.price) || b.price < 1)
      throw Error("Choose a positive price.");
    const c = d.cards.find((c) => c.id === b.card),
      level = take(b.card, b.variant);
    const row = {
      id: Date.now(),
      card: b.card,
      kind: c.kind,
      level,
      seller: me.id,
      seller_name: me.name,
      price: b.price,
      reserve: b.price,
      bid: 0,
      winner: null,
      ends: now + (b.hours || b.days * 24 || 72) * 3600000,
      buyout: b.buyout || null,
      status: "open",
      claimed: 0,
    };
    if (b.venue === "shop") s.market.push(row);
    else s.auctions.push(row);
    return { message: "Demo card listed." };
  }
  if (path === "cancel-listing") {
    const l = (b.venue === "shop" ? s.market : s.auctions).find(
      (l) => l.id === b.listing && l.seller === me.id,
    );
    if (!l || l.winner || l.closed || l.status === "cancelled")
      throw Error("Listing cannot be withdrawn.");
    add(l.card, l.level);
    l.closed = 1;
    l.status = "cancelled";
    return { message: "Demo card returned." };
  }
  if (path === "buyout" || path === "bid") {
    const a = s.auctions.find((a) => a.id === b.auction);
    if (!a || a.closed || a.ends <= now || a.seller === me.id)
      throw Error("Auction unavailable.");
    if (path === "buyout" || (a.buyout && b.amount >= a.buyout)) {
      if (!a.buyout) throw Error("No buyout price.");
      d.wallet(
        -(a.buyout - (a.winner === me.id ? a.bid : 0)),
        "Demo auction buyout",
      );
      add(a.card, a.level || 1);
      Object.assign(a, {
        bid: a.buyout,
        winner: me.id,
        closed: 1,
        claimed: 1,
        paid: 1,
        ends: now,
      });
      return { message: "Demo auction bought out." };
    }
    if (b.amount < (a.bid ? a.bid + 1 : a.reserve || 1))
      throw Error("Bid is below the minimum.");
  }
  if (path === "buy-listing" || path === "shop-buy") {
    const l = (path === "shop-buy" ? s.shop : s.market).find(
      (x) => x.id === (b.slot || b.listing),
    );
    if (!l || l.buyer || l.status === "sold" || l.seller === me.id)
      throw Error("This card cannot be purchased.");
    d.wallet(-l.price, "Demo shop purchase");
    add(l.card, l.level || 1);
    l.buyer = me.id;
    l.status = "sold";
    return { message: "Demo card added to your collection." };
  }
  if (path === "gamble") {
    if (!Number.isSafeInteger(b.stake) || b.stake < 10 || b.stake > 10000)
      throw Error("Bet 10–10,000 credits.");
    d.wallet(-b.stake, "Demo gambling stake");
    const die = () => Math.floor(Math.random() * 6) + 1;
    let outcome, won, rate;
    if (b.game === "coin") {
      outcome = Math.random() < 0.5 ? "heads" : "tails";
      won = b.choice === outcome;
      rate = 1.9;
    } else if (b.game === "dice") {
      outcome = die();
      won = b.choice === "low" ? outcome <= 3 : outcome >= 4;
      rate = 1.9;
    } else {
      outcome = [die(), die()];
      won = outcome[0] + outcome[1] === 7;
      rate = 5.4;
    }
    const payout = won ? Math.floor(b.stake * rate) : 0;
    if (payout) d.wallet(payout, "Demo gambling payout");
    const result = {
      game: b.game,
      outcome,
      won,
      stake: b.stake,
      payout,
      net: payout - b.stake,
    };
    s.gambling.push(result);
    return { ...result, message: "Demo round completed." };
  }
  return undefined;
}
