import {
  CLIMB_ENTRY,
  CLIMB_CHOICES,
  CLIMB_OPTIONS,
  climbHeight,
  climbPayout,
} from "../public/pachinko-rules.js";

// Exact dynamic programming: the best expected value among three distinct
// uniformly offered routes. Sorted route j is the maximum in C(j,2) triples.
function optimalValue(terminal) {
  const maximum = CLIMB_CHOICES * Math.max(...CLIMB_OPTIONS.map((o) => o.max));
  let values = Array.from({ length: maximum + 1 }, (_, h) => terminal(h));
  const count = CLIMB_OPTIONS.length;
  const triples = (count * (count - 1) * (count - 2)) / 6;
  for (let turn = 0; turn < CLIMB_CHOICES; turn++) {
    values = values.map((_, h) => {
      const routes = CLIMB_OPTIONS.map((o) => {
        let sum = 0;
        for (let d = o.min; d <= o.max; d++)
          sum += values[Math.min(maximum, climbHeight(h, d))];
        return sum / (o.max - o.min + 1);
      }).sort((a, b) => a - b);
      return (
        routes.reduce((sum, value, j) => sum + (value * j * (j - 1)) / 2, 0) /
        triples
      );
    });
  }
  return values[0];
}

const expectedPayout = optimalValue(climbPayout);
console.log(
  JSON.stringify(
    {
      entry: CLIMB_ENTRY,
      choices: CLIMB_CHOICES,
      expectedOptimalHeight: optimalValue((h) => h),
      expectedPayout,
      optimalReturnPercent: (expectedPayout / CLIMB_ENTRY) * 100,
    },
    null,
    2,
  ),
);
