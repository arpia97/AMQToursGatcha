import {
  Shoupai,
  hule,
  rule,
  xiangting,
  tingpai,
} from "./vendor/mahjong-scoring.js";

export const MAHJONG_START = 1000;
export const MAHJONG_DISCARD = 100;
export const MAHJONG_RIICHI = 1000;
export const WINDS = ["East", "South", "West", "North"];
const tileCode = (t) =>
  t < 27 ? "mps"[Math.floor(t / 9)] + ((t % 9) + 1) : "z" + (t - 26);

// Solo draw-and-replace variant: 14 dead tiles and 39 unseen opponent tiles
// are set aside. The 69 live tiles advance by one self-draw and up to three
// unseen opponent draws per paid discard.
export function dealMahjong(rand) {
  const tiles = Array.from({ length: 136 }, (_, i) => Math.floor(i / 4));
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  const seat = rand(4),
    indicator = tiles[0];
  const hand = tiles.slice(53, 66).sort((a, b) => a - b);
  hand.push(tiles[66]);
  return {
    seat,
    indicator,
    uraIndicator: tiles[1],
    hand,
    wall: tiles.slice(67),
    discards: [],
    version: 0,
    status: "active",
    cost: MAHJONG_START,
    payout: 0,
    result: null,
  };
}

const names = {
  立直: "Riichi",
  ダブル立直: "Double Riichi",
  一発: "Ippatsu",
  裏ドラ: "Ura-dora",
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
    game.hand?.length !== 14 ||
    !Number.isInteger(game.seat) ||
    game.seat < 0 ||
    game.seat > 3
  )
    return null;
  const counts = Array(34).fill(0);
  for (const t of game.hand) {
    if (!Number.isInteger(t) || t < 0 || t > 33 || ++counts[t] > 4) return null;
  }
  const hand = new Shoupai(game.hand.slice(0, 13).map(tileCode));
  hand.zimo(tileCode(game.hand[13]));
  const value = hule(hand, null, {
    rule: rule({ 赤牌: { m: 0, p: 0, s: 0 } }),
    zhuangfeng: 0,
    menfeng: game.seat,
    hupai: {
      lizhi: game.riichi || 0,
      yifa: !!game.riichi && !!game.ippatsu,
      haidi: (game.lastDrawFinal ?? game.wall.length === 0) ? 1 : 0,
    },
    baopai: [tileCode(game.indicator)],
    fubaopai:
      revealUra && game.riichi && Number.isInteger(game.uraIndicator)
        ? [tileCode(game.uraIndicator)]
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
export function tenpaiMahjong(hand) {
  if (!Array.isArray(hand) || ![13, 14].includes(hand.length)) return null;
  const counts = Array(34).fill(0);
  if (
    hand.some((t) => !Number.isInteger(t) || t < 0 || t > 33 || ++counts[t] > 4)
  )
    return null;
  const choices =
    hand.length === 13
      ? [-1]
      : [13, ...Array.from({ length: 13 }, (_, i) => i)];
  const seen = new Set();
  for (const index of choices) {
    if (index >= 0 && seen.has(hand[index])) continue;
    if (index >= 0) seen.add(hand[index]);
    const tiles = hand.filter((_, i) => i !== index);
    const shoupai = new Shoupai(tiles.map(tileCode));
    if (xiangting(shoupai) !== 0) continue;
    const waits = tingpai(shoupai).map((code) =>
      code[0] === "z"
        ? 26 + Number(code[1])
        : "mps".indexOf(code[0]) * 9 + Number(code[1]) - 1,
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
  const ready = tenpaiMahjong(game.hand);
  game.tenpai = !!ready;
  game.waits = ready?.waits || [];
  // Resolve the final free discard optimally, leaving the actual 13-tile hand
  // used for the tenpai check. No extra draw or discard fee is charged.
  if (game.hand.length === 14) {
    const index = ready?.discardIndex ?? 13;
    game.discards.push(game.hand[index]);
    game.hand.splice(index, 1);
  }
  game.status = "exhausted";
  game.refund = ready ? MAHJONG_START : 0;
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
    game.hand?.length !== 14
  )
    return [];
  return game.hand.flatMap((_, index) => {
    const ready = tenpaiMahjong(game.hand.filter((_, i) => i !== index));
    return ready ? [{ index, waits: ready.waits }] : [];
  });
}
export function declareRiichi(game, index) {
  const option = riichiDiscards(game).find((o) => o.index === index);
  if (!option) return null;
  const next = structuredClone(game);
  next.riichi = next.discards.length === 0 ? 2 : 1;
  next.riichiDiscard = next.discards.length;
  next.riichiWaits = option.waits;
  next.riichiStake = MAHJONG_RIICHI;
  next.ippatsu = true;
  next.cost += MAHJONG_RIICHI;
  return replaceMahjong(next, index, { declaring: true });
}
export function replaceMahjong(game, index, { declaring = false } = {}) {
  if (game.riichi && !declaring && index !== 13)
    throw Error("After Riichi, only the newly drawn tile may be discarded.");
  const next = structuredClone(game);
  if (next.riichi && !declaring) next.ippatsu = false;
  next.discards.push(next.hand[index]);
  const kept = next.hand.filter((_, i) => i !== index).sort((a, b) => a - b);
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
  const { wall, uraIndicator, ...visible } = game;
  return {
    ...visible,
    uraAvailable: Number.isInteger(uraIndicator),
    ...(game.status === "won" && game.riichi && Number.isInteger(uraIndicator)
      ? { uraIndicator }
      : {}),
    remaining: wall.length,
    turnsLeft: Math.ceil(wall.length / 4),
    score: game.status === "active" ? scoreMahjong(game) : game.result,
    riichiOptions: riichiDiscards(game),
  };
}
