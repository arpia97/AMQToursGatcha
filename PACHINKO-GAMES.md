# Roulette and Mountain Climbing

These games replace Coin Flip and add another independent game to Pachinko. Existing Mahjong, Horse Racing and Gem Faceting rules are unchanged. All stakes and returns are game credits.

## Roulette

The animated wooden wheel has 37 equal pockets: 18 red, 18 black and one green. This is our explicit ruleset, inspired by the supplied reference rather than a claim about that game's internal probabilities.

| Bet          | Win probability | Gross return | Expected return |
| ------------ | --------------- | ------------ | --------------- |
| Red or black | 18/37 (48.65%)  | 2× stake     | 97.30%          |
| Green        | 1/37 (2.70%)    | 35× stake    | 94.59%          |

Gross returns include the stake; a loss returns zero. Whole-credit bets range from 1 to 1,000,000 within the player's balance. The server debits and commits one random pocket before the 4.6-second animation. The wager cannot change during the spin. Refreshing resumes it, and the next state read after completion pays exactly once, including after an offline visit. Animation frames make no API requests. Reduced-motion preferences show the final wheel orientation without spinning; settlement still uses the server clock.

## Mountain Climbing

Entry costs **500 credits**, followed by **ten free choices**. Each turn offers three distinct routes sampled uniformly from all 18 requested routes. The offer is saved and survives refresh. Routes can recur on later turns. Every integer in a random range is equally likely. Height begins at zero and cannot fall below zero.

Guaranteed routes: +1, +2, +3, +5. Random routes: 1–6, −1–1, −1–2, −1–3, −2–3, −2–4, −2–5, −3–3, −3–4, −3–5, −5–10, −5–5, −10–10, −7–7.

After the tenth choice, payout is **18 × final height**. There are no early cash-outs or additional fees. Maximum height is 100 (1,800 credits); height 28 returns 504, covering entry. Net gambling profit is payout minus 500.

`node tools/analyze-climbing.mjs` calculates the exact optimal-policy expectation by dynamic programming, using the production constants. For each height and number of choices remaining, it averages future value for every route, then averages the best route in each equally likely three-route offer. This yields expected final height 26.24655, gross payout 472.43795 and **94.48759% return** with optimal choices. Actual play varies, and other strategies can return less. This is a provisional balanced payout curve, not a guaranteed return per hand.

## API and persistence

All mutations require a player session and an `Idempotency-Key`:

- `POST /api/roulette-start`: `{previousGame:null|id, choice:"red"|"black"|"green", stake}`.
- `POST /api/climb-start`: `{previousGame:null|id}`.
- `POST /api/climb-choose`: `{game, version, option}`. Option is an offered route ID (0–17), not a client-supplied roll or payout.

Mutations return a compact `gameState`. Both full state and `GET /api/game-state` include only the current player's `roulette` and `climb`. Starts reject a stale previous ID or unfinished game; climbing moves reject stale revisions and unavailable routes. Crypto-backed server randomness determines every pocket, offer and random step. Debits, game state, receipts and payouts share the existing SQLite transaction.

One bounded `pachinko_games` row per player stores both current games. Detailed round payloads retain the latest 50 of each new game; financial totals remain for rankings. State follows alias migrations and existing gameplay-reset scopes. No deployment reset or account grant is required. The retired `/api/gamble` endpoint returns 410, preserving old financial records without allowing old Coin Flip clients to place bets.
