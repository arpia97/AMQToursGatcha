import {
  Shoupai,
  hule,
  hule_mianzi,
  rule,
  xiangting,
  tingpai,
} from "./vendor/mahjong-scoring.js";

export const MAHJONG_START = 500;
export const MAHJONG_DISCARD = 50;
export const MAHJONG_RIICHI = 1000;
// Hands saved before per-hand entry fees existed were charged 1,000.
export const mahjongEntryFee = (game) => game?.entryFee ?? 1000;
export const WINDS = ["East", "South", "West", "North"];
export const isRedTile = (t) => Number.isInteger(t) && t >= 34 && t <= 36;
export const tileBase = (t) => (isRedTile(t) ? [4, 13, 22][t - 34] : t);
export const tileSort = (a, b) => tileBase(a) - tileBase(b) || b - a;
export const tileCode = (t) =>
  isRedTile(t)
    ? "mps"[t - 34] + "0"
    : t < 27
      ? "mps"[Math.floor(t / 9)] + ((t % 9) + 1)
      : "z" + (t - 26);
const meldCode = (tiles) =>
  Shoupai.valid_mianzi(
    tileCode(tiles[0])[0] + tiles.map((t) => tileCode(t)[1]).join(""),
  );
function validTiles(hand, melds = []) {
  if (
    !Array.isArray(hand) ||
    !Array.isArray(melds) ||
    melds.length > 4 ||
    melds.some(
      (m) =>
        !Array.isArray(m) ||
        m.length !== 4 ||
        m.some((t) => tileBase(t) !== tileBase(m[0])),
    )
  )
    return false;
  const counts = Array(34).fill(0),
    red = new Set();
  for (const t of [...hand, ...melds.flat()]) {
    if (!Number.isInteger(t) || t < 0 || t > 36 || ++counts[tileBase(t)] > 4)
      return false;
    if (isRedTile(t)) {
      if (red.has(t)) return false;
      red.add(t);
    }
  }
  return true;
}
export function mahjongShoupai(hand, melds = [], drawn = false) {
  const kept = drawn ? hand.slice(0, -1) : hand;
  const s = Shoupai.fromString(
    kept.map(tileCode).join("") +
      (melds.length ? "," + melds.map(meldCode).join(",") : ""),
  );
  if (drawn) s.zimo(tileCode(hand.at(-1)));
  return s;
}

// Solo draw-and-replace variant: 14 dead tiles and 39 unseen opponent tiles
// are set aside. The 69 live tiles advance by one self-draw and up to three
// unseen opponent draws per paid discard.
export function mahjongTilePool() {
  const tiles = Array.from({ length: 136 }, (_, i) => Math.floor(i / 4));
  for (const [base, red] of [
    [4, 34],
    [13, 35],
    [22, 36],
  ])
    tiles[base * 4] = red;
  return tiles;
}
export function dealMahjong(rand) {
  const tiles = mahjongTilePool();
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  const seat = rand(4),
    indicator = tiles[0];
  const hand = tiles.slice(53, 66).sort(tileSort);
  hand.push(tiles[66]);
  return {
    seat,
    indicator,
    uraIndicator: tiles[1],
    indicators: [tiles[0]],
    uraIndicators: [tiles[1]],
    nextIndicators: Array.from({ length: 4 }, (_, i) =>
      tiles.slice(2 + i * 2, 4 + i * 2),
    ),
    rinshanTiles: tiles.slice(10, 14),
    deadWallTail: [],
    melds: [],
    hand,
    wall: tiles.slice(67),
    discards: [],
    version: 0,
    status: "active",
    cost: MAHJONG_START,
    entryFee: MAHJONG_START,
    payout: 0,
    result: null,
  };
}

const names = {
  立直: "Riichi",
  ダブル立直: "Double Riichi",
  一発: "Ippatsu",
  裏ドラ: "Ura-dora",
  赤ドラ: "Aka-dora",
  嶺上開花: "Rinshan kaihou",
  三槓子: "Sankantsu",
  四槓子: "Suukantsu",
  門前清自摸和: "Menzen tsumo",
  平和: "Pinfu",
  断幺九: "Tanyao",
  一盃口: "Iipeikou",
  二盃口: "Ryanpeikou",
  七対子: "Seven pairs",
  対々和: "Toitoi",
  三暗刻: "Sanankou",
  三色同順: "Sanshoku doujun",
  三色同刻: "Sanshoku doukou",
  一気通貫: "Ittsu",
  混全帯幺九: "Chanta",
  純全帯幺九: "Junchan",
  混老頭: "Honroutou",
  小三元: "Shousangen",
  混一色: "Honitsu",
  清一色: "Chinitsu",
  海底摸月: "Haitei",
  四暗刻: "Suuankou",
  四暗刻単騎: "Suuankou tanki",
  大三元: "Daisangen",
  小四喜: "Shousuushii",
  大四喜: "Daisuushii",
  字一色: "Tsuuiisou",
  緑一色: "Ryuuiisou",
  清老頭: "Chinroutou",
  国士無双: "Thirteen orphans",
  国士無双十三面: "Thirteen orphans · 13-sided wait",
  九蓮宝燈: "Nine gates",
  純正九蓮宝燈: "Pure nine gates",
  ドラ: "Dora",
};
function yakuName(name) {
  if (name.startsWith("場風")) return "Round wind · East";
  if (name.startsWith("自風"))
    return (
      "Seat wind · " +
      ({ 東: "East", 南: "South", 西: "West", 北: "North" }[name.slice(-1)] ||
        "")
    );
  if (name.startsWith("翻牌"))
    return (
      { 白: "White dragon", 發: "Green dragon", 中: "Red dragon" }[
        name.slice(-1)
      ] || name
    );
  return names[name] || name;
}
export function scoreMahjong(game, { revealUra = false } = {}) {
  if (
    !game ||
    game.hand?.length !== 14 - 3 * (game.melds?.length || 0) ||
    !Number.isInteger(game.seat) ||
    game.seat < 0 ||
    game.seat > 3
  )
    return null;
  if (!validTiles(game.hand, game.melds)) return null;
  const hand = mahjongShoupai(game.hand, game.melds, true);
  const value = hule(hand, null, {
    rule: rule({ 赤牌: { m: 1, p: 1, s: 1 } }),
    zhuangfeng: 0,
    menfeng: game.seat,
    hupai: {
      lizhi: game.riichi || 0,
      yifa: !!game.riichi && !!game.ippatsu,
      haidi:
        !game.rinshan && (game.lastDrawFinal ?? game.wall.length === 0) ? 1 : 0,
      lingshang: !!game.rinshan,
    },
    baopai: (game.indicators || [game.indicator]).map(tileCode),
    fubaopai:
      revealUra && game.riichi && Number.isInteger(game.uraIndicator)
        ? (game.uraIndicators || [game.uraIndicator]).map(tileCode)
        : [],
    jicun: { changbang: 0, lizhibang: 0 },
  });
  if (!value?.defen) return null;
  const yakuman = value.damanguan || 0,
    han = value.fanshu || 0;
  const limit = yakuman
    ? yakuman > 1
      ? yakuman + "× Yakuman"
      : "Yakuman"
    : han >= 13
      ? "Counted yakuman"
      : han >= 11
        ? "Sanbaiman"
        : han >= 8
          ? "Baiman"
          : han >= 6
            ? "Haneman"
            : value.defen >= (game.seat === 0 ? 12000 : 8000)
              ? "Mangan"
              : "";
  return {
    payout: value.defen,
    han,
    fu: value.fu || 0,
    yakuman,
    limit,
    yaku: value.hupai.map((y) => ({
      name: yakuName(y.name),
      han: typeof y.fanshu === "number" ? y.fanshu : 0,
      yakuman: typeof y.fanshu === "string" ? y.fanshu.length : 0,
    })),
    payments: value.fenpei
      .map((n, seat) => ({ seat: WINDS[seat], amount: Math.max(0, -n) }))
      .filter((p) => p.amount > 0),
  };
}
export function tenpaiMahjong(hand, melds = []) {
  const n = 13 - 3 * melds.length;
  if (
    !Array.isArray(hand) ||
    ![n, n + 1].includes(hand.length) ||
    !validTiles(hand, melds)
  )
    return null;
  const choices =
    hand.length === n
      ? [-1]
      : [
          hand.length - 1,
          ...Array.from({ length: hand.length - 1 }, (_, i) => i),
        ];
  const seen = new Set();
  for (const index of choices) {
    if (index >= 0 && seen.has(hand[index])) continue;
    if (index >= 0) seen.add(hand[index]);
    const tiles = hand.filter((_, i) => i !== index);
    const shoupai = mahjongShoupai(tiles, melds);
    if (xiangting(shoupai) !== 0) continue;
    const waits = tingpai(shoupai)
      .map((code) =>
        code[0] === "z"
          ? 26 + Number(code[1])
          : "mps".indexOf(code[0]) * 9 + Number(code[1]) - 1,
      )
      .filter(
        (t) =>
          [...tiles, ...melds.flat()].filter((x) => tileBase(x) === t).length <
          4,
      );
    if (waits.length)
      return {
        discardIndex: index,
        discard: index >= 0 ? hand[index] : null,
        waits,
      };
  }
  return null;
}
export function exhaustMahjong(game) {
  const ready = tenpaiMahjong(game.hand, game.melds);
  game.tenpai = !!ready;
  game.waits = ready?.waits || [];
  // Resolve the final free discard optimally, leaving the actual 13-tile hand
  // used for the tenpai check. No extra draw or discard fee is charged.
  if (game.hand.length === 14 - 3 * (game.melds?.length || 0)) {
    const index = ready?.discardIndex ?? game.hand.length - 1;
    game.discards.push(game.hand[index]);
    game.hand.splice(index, 1);
  }
  game.status = "exhausted";
  game.refund = ready ? mahjongEntryFee(game) : 0;
  game.payout = game.refund;
  return game;
}
export function riichiDiscards(game) {
  const remaining = game?.wall?.length ?? game?.remaining ?? 0;
  if (
    !game ||
    game.status !== "active" ||
    game.riichi ||
    remaining < 4 ||
    game.hand?.length !== 14 - 3 * (game.melds?.length || 0)
  )
    return [];
  return game.hand.flatMap((_, index) => {
    const ready = tenpaiMahjong(
      game.hand.filter((_, i) => i !== index),
      game.melds,
    );
    return ready ? [{ index, waits: ready.waits }] : [];
  });
}
export function declareRiichi(game, index) {
  const option = riichiDiscards(game).find((o) => o.index === index);
  if (!option) return null;
  const next = structuredClone(game);
  next.riichi = next.discards.length === 0 && !next.melds?.length ? 2 : 1;
  next.riichiDiscard = next.discards.length;
  next.riichiWaits = option.waits;
  next.riichiStake = MAHJONG_RIICHI;
  next.ippatsu = true;
  next.cost += MAHJONG_RIICHI;
  return replaceMahjong(next, index, { declaring: true });
}
export function replaceMahjong(game, index, { declaring = false } = {}) {
  if (game.riichi && !declaring && index !== game.hand.length - 1)
    throw Error("After Riichi, only the newly drawn tile may be discarded.");
  const next = structuredClone(game);
  if (next.riichi && !declaring) next.ippatsu = false;
  next.rinshan = false;
  next.discards.push(next.hand[index]);
  const kept = next.hand.filter((_, i) => i !== index).sort(tileSort);
  next.lastDrawFinal = next.wall.length === 1;
  next.hand = [...kept, next.wall.shift()];
  next.wall.splice(0, 3);
  next.cost += MAHJONG_DISCARD;
  next.version++;
  if (!next.wall.length && !scoreMahjong(next)) exhaustMahjong(next);
  return next;
}
export function publicMahjong(game) {
  if (!game) return null;
  const {
    wall,
    uraIndicator,
    uraIndicators,
    nextIndicators,
    rinshanTiles,
    deadWallTail,
    ...visible
  } = game;
  return {
    ...visible,
    uraAvailable: Number.isInteger(uraIndicator),
    ...(game.status === "won" && game.riichi && Number.isInteger(uraIndicator)
      ? { uraIndicator, uraIndicators: uraIndicators || [uraIndicator] }
      : {}),
    remaining: wall.length,
    turnsLeft: Math.ceil(wall.length / 4),
    score: game.status === "active" ? scoreMahjong(game) : game.result,
    riichiOptions: riichiDiscards(game),
    kanOptions: kanOptions(game),
    kanAvailable: Array.isArray(rinshanTiles),
  };
}

export function kanOptions(game) {
  if (
    !game ||
    game.status !== "active" ||
    !(game.wall?.length ?? game.remaining) ||
    !game.rinshanTiles?.length ||
    !game.nextIndicators?.length ||
    (game.melds?.length || 0) >= 4 ||
    !validTiles(game.hand, game.melds)
  )
    return [];
  const sp = mahjongShoupai(game.hand, game.melds, true);
  let choices = sp.get_gang_mianzi() || [];
  if (game.riichi) {
    const drawn = tileBase(game.hand.at(-1));
    choices = choices.filter((code) => {
      if (tileBaseCode(code) !== drawn) return false;
      const before = sp.clone().dapai(tileCode(game.hand.at(-1))),
        after = sp.clone().gang(code);
      const waits = tingpai(before),
        next = tingpai(after);
      if (
        xiangting(after) !== 0 ||
        waits.slice().sort().join() !== next.slice().sort().join()
      )
        return false;
      // Preserve all winning interpretations, as well as the actual wait set.
      return waits.every(
        (p) => hule_mianzi(before, p).length === hule_mianzi(after, p).length,
      );
    });
  }
  return choices.map((code) => ({
    tile: tileBaseCode(code),
    tiles: game.hand.filter((t) => tileBase(t) === tileBaseCode(code)),
  }));
}
const tileBaseCode = (code) =>
  code[0] === "z"
    ? 26 + Number(code[1])
    : "mps".indexOf(code[0]) * 9 + (Number(code[1]) || 5) - 1;
export function kanMahjong(game, tile) {
  const option = kanOptions(game).find((o) => o.tile === tile);
  if (!option) return null;
  const next = structuredClone(game);
  next.hand = next.hand.filter((t) => tileBase(t) !== tile).sort(tileSort);
  (next.melds ||= []).push(option.tiles);
  next.hand.push(next.rinshanTiles.shift());
  (next.deadWallTail ||= []).push(next.wall.pop());
  const pair = next.nextIndicators.shift();
  (next.indicators ||= [next.indicator]).push(pair[0]);
  (next.uraIndicators ||= [next.uraIndicator]).push(pair[1]);
  next.rinshan = true;
  next.lastDrawFinal = false;
  next.ippatsu = false;
  next.version++;
  if (!next.wall.length && !scoreMahjong(next)) exhaustMahjong(next);
  return next;
}
