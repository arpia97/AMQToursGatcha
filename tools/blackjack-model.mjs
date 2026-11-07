// Optional balance analysis; not part of the automated regression suite.
// Infinite-shoe optimal Hit/Stand decisions, then a seeded four-deck simulation.
const values = [7, 6, 9, 12, 15, 18, 21, 24, 27, 30, 30, 30, 30];
const score = (sum, aces) => sum + (aces && sum + 30 <= 67 ? 30 : 0);
const strategies = new Map();
for (const threshold of [52]) {
  const dealerMemo = new Map();
  function dealer(sum, aces) {
    const key = sum + ":" + aces;
    if (dealerMemo.has(key)) return dealerMemo.get(key);
    const result = {};
    const total = score(sum, aces);
    if (sum > 67) result.bust = 1;
    else if (total >= threshold) result[total] = 1;
    else
      for (const v of values) {
        for (const [k, p] of Object.entries(dealer(sum + v, aces + (v === 7))))
          result[k] = (result[k] || 0) + p / 13;
      }
    dealerMemo.set(key, result);
    return result;
  }
  let ev = 0;
  for (const up of values) {
    let natural = 0,
      dist = {};
    for (const hole of values) {
      if (score(up + hole, (up === 7) + (hole === 7)) === 67) natural += 1 / 13;
      else
        for (const [k, p] of Object.entries(
          dealer(up + hole, (up === 7) + (hole === 7)),
        ))
          dist[k] = (dist[k] || 0) + p / 13;
    }
    for (const k in dist) dist[k] /= 1 - natural;
    const memo = new Map(),
      decisions = new Map();
    function optimal(sum, aces) {
      if (sum > 67) return -1;
      const key = sum + ":" + aces;
      if (memo.has(key)) return memo.get(key);
      const total = score(sum, aces);
      let stand = dist.bust || 0;
      for (const [k, p] of Object.entries(dist))
        if (k !== "bust") stand += total > +k ? p : total < +k ? -p : 0;
      let hit = 0;
      for (const v of values) hit += optimal(sum + v, aces + (v === 7)) / 13;
      decisions.set(key, hit > stand);
      const result = Math.max(stand, hit);
      memo.set(key, result);
      return result;
    }
    strategies.set(up, (sum, aces) => {
      optimal(sum, aces);
      return decisions.get(sum + ":" + aces);
    });
    for (const a of values)
      for (const b of values) {
        const sum = a + b,
          aces = (a === 7) + (b === 7);
        ev +=
          (score(sum, aces) === 67
            ? (1 - natural) * 1.5
            : -natural + (1 - natural) * optimal(sum, aces)) / 2197;
      }
  }
  console.log({ threshold, optimalNet: ev, returnPercent: (1 + ev) * 100 });
}
let seed = 3467;
const random = (n) => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) % n;
};
let net = 0;
const count = 300000;
for (let i = 0; i < count; i++) {
  const shoe = Array.from({ length: 208 }, (_, j) => values[j % 13]);
  for (let j = shoe.length - 1; j > 0; j--) {
    const k = random(j + 1);
    [shoe[j], shoe[k]] = [shoe[k], shoe[j]];
  }
  let a = shoe.pop(),
    up = shoe.pop(),
    b = shoe.pop(),
    hole = shoe.pop(),
    sum = a + b,
    aces = (a === 7) + (b === 7),
    ds = up + hole,
    da = (up === 7) + (hole === 7);
  if (score(sum, aces) === 67 || score(ds, da) === 67) {
    net += score(sum, aces) === 67 ? (score(ds, da) === 67 ? 0 : 1.5) : -1;
    continue;
  }
  while (sum <= 67 && strategies.get(up)(sum, aces)) {
    const v = shoe.pop();
    sum += v;
    aces += v === 7;
  }
  if (sum > 67) {
    net--;
    continue;
  }
  while (score(ds, da) < 52) {
    const v = shoe.pop();
    ds += v;
    da += v === 7;
  }
  net +=
    ds > 67 || score(sum, aces) > score(ds, da)
      ? 1
      : score(sum, aces) < score(ds, da)
        ? -1
        : 0;
}
console.log(
  JSON.stringify({
    hands: count,
    finiteDeckOptimalReturnPercent: (1 + net / count) * 100,
    houseEdgePercent: (-net / count) * 100,
  }),
);
