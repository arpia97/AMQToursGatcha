# Roulette and Mountain Climbing

These games replace Coin Flip and add another independent game to Pachinko. Existing Mahjong, Horse Racing and Gem Faceting rules are unchanged. All stakes and returns are game credits.

## Roulette

The animated wooden wheel has 37 equal pockets: 18 red, 18 black and one green. This is our explicit ruleset, inspired by the supplied reference rather than a claim about that game's internal probabilities.

| Bet          | Win probability | Gross return | Expected return |
| ------------ | --------------- | ------------ | --------------- |
| Red or black | 18/37 (48.65%)  | 2× stake     | 97.30%          |
| Green        | 1/37 (2.70%)    | 35× stake    | 94.59%          |

Gross returns include the stake; a loss returns zero. Whole-credit bets range from 1 to 1,000,000 within the player's balance. The server debits and commits one random pocket before the 4.6-second animation. The wager cannot change during the spin. Refreshing resumes it, and the next state read after completion pays exactly once, including after an offline visit. Animation frames make no API requests.

The wheel accelerates, rolls and slows while the ball travels in the opposite direction, drops inward, bounces and settles under the pointer. The exact pocket highlights after the stop. **Full Animation** is the default and overrides the site's system reduced-motion reset for roulette only. Players can choose **System Setting** or **Reduced Motion**, saved in their browser independently of card-pack settings. Those choices show the correct static stop when motion is reduced; settlement always uses the server clock. Refreshes use the elapsed server time rather than restarting the spin.

## Mountain Climbing

Entry costs **500 credits**, followed by **ten free choices**. Each turn offers three distinct routes sampled uniformly from all 18 requested routes. The offer is saved and survives refresh. Routes can recur on later turns. Heights and routes use metres: every integer metre in a random range is equally likely. Height begins at zero and cannot fall below zero.

Guaranteed routes: +10 m, +20 m, +30 m, +50 m. Random routes: 10–60 m, −10–10 m, −10–20 m, −10–30 m, −20–30 m, −20–40 m, −20–50 m, −30–30 m, −30–40 m, −30–50 m, −50–100 m, −50–50 m, −100–100 m, −70–70 m. For example, −100–100 m has 201 equally likely outcomes, including +68 m.

After the tenth choice, payout is **floor(18 × final height / 10)**. There are no early cash-outs or additional fees. Maximum height is 1,000 m (1,800 credits); 278 m returns 500 credits, covering entry. Net gambling profit is payout minus 500. Existing games convert their stored old steps to metres once, preserving paid entry, turns, saved offers, revisions and previous payouts. New random choices use whole-metre precision.

`node tools/analyze-climbing.mjs` calculates the exact optimal-policy expectation by dynamic programming, using the production constants. For each height and number of choices remaining, it averages future value for every route, then averages the best route in each equally likely three-route offer. With whole-metre rolls and rounded payouts, this yields optimal expected gross payout 470.25597 and **94.05119% return**. Actual play varies, and other strategies can return less. This is a provisional balanced payout curve, not a guaranteed return per hand.

## API and persistence

All mutations require a player session and an `Idempotency-Key`:

- `POST /api/roulette-start`: `{previousGame:null|id, choice:"red"|"black"|"green", stake}`.
- `POST /api/climb-start`: `{previousGame:null|id}`.
- `POST /api/climb-choose`: `{game, version, option}`. Option is an offered route ID (0–17), not a client-supplied roll or payout.

Mutations return a compact `gameState`. Both full state and `GET /api/game-state` include only the current player's `roulette` and `climb`. Climbing snapshots include `distanceUnit:"m"`; `height` and each move's `from`, `to` and `delta` are integer metres. Old unmarked payloads are converted on read without a separate financial migration. Starts reject a stale previous ID or unfinished game; climbing moves reject stale revisions and unavailable routes. Crypto-backed server randomness determines every pocket, offer and random step. Debits, game state, receipts and payouts share the existing SQLite transaction.

One bounded `pachinko_games` row per player stores both current games. Detailed round payloads retain the latest 50 of each new game; financial totals remain for rankings. State follows alias migrations and existing gameplay-reset scopes. No deployment reset or account grant is required. The retired `/api/gamble` endpoint returns 410, preserving old financial records without allowing old Coin Flip clients to place bets.
