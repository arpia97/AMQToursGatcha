import { Shoupai, hule, rule } from "./vendor/mahjong-scoring.js";

export const MAHJONG_START = 1000;
export const MAHJONG_DISCARD = 100;
export const WINDS = ["East", "South", "West", "North"];
const tileCode = (t) =>
  t < 27 ? "mps"[Math.floor(t / 9)] + ((t % 9) + 1) : "z" + (t - 26);

// Solo draw-and-replace variant: 14 dead tiles and 39 unseen opponent tiles
// are set aside. The first self-draw leaves 69 available replacements.
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
export function scoreMahjong(game) {
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
    hupai: { haidi: game.wall.length === 0 ? 1 : 0 },
    baopai: [tileCode(game.indicator)],
    fubaopai: [],
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
export function replaceMahjong(game, index) {
  const next = structuredClone(game);
  next.discards.push(next.hand[index]);
  const kept = next.hand.filter((_, i) => i !== index).sort((a, b) => a - b);
  next.hand = [...kept, next.wall.shift()];
  next.cost += MAHJONG_DISCARD;
  next.version++;
  if (!next.wall.length && !scoreMahjong(next)) next.status = "exhausted";
  return next;
}
export function publicMahjong(game) {
  if (!game) return null;
  const { wall, ...visible } = game;
  return {
    ...visible,
    remaining: wall.length,
    score: game.status === "active" ? scoreMahjong(game) : game.result,
  };
}
