# Horse Racing

An English Pachinko game using **163 horse portraits** from the supplied GameTora folder. Eleven staff profiles are excluded. Preparing a field is free; only tickets cost credits. No source requests occur while playing: portraits and records ship with the site.

## Historical strength and appearances

The October 28, 2026 snapshot uses GameTora's public `characters.690aa811.json`. `rl.win_stats[0]` is G1/Jpn1 wins, `[2]` is total graded wins; the overlapping international-G1 column is not added again. Japanese names are matched against JRA's Hall of Fame roster. These are historical source statistics, including its treatment of older races, rather than live race ratings.

Base strength is `1 + 0.60 × G1/Jpn1 wins + 0.08 × graded wins + 0.60 if Hall of Fame`. Fictional/unrated characters use 1. Multiply by independent race-day form, sampled uniformly from 70–130%. For example, Gold Ship starts at **5.48**, Haru Urara at **1.00**, before form. A higher strength raises winning/placing chances and lowers payout odds; no result is guaranteed.

Every field draws **six decorated horses** (at least three G1/Jpn1 wins or Hall of Fame) and **six others**, uniformly without replacement within each group, then shuffles gate numbers. The groups contain 62 and 101 characters respectively, giving individual appearance rates 6/62 and 6/101. This balances group appearances independently of strength. The nine explicitly fictional profiles remain baseline. Surface/distance specialization, injuries, dead heats and scratches are not simulated.

Record sources: [GameTora profiles](https://gametora.com/umamusume/characters/profiles), [JRA Hall of Fame](https://jra.jp/gallery/dendo/index.html). Cross-checks: [JRA's six-time G1 winner Gold Ship](https://japanracing.jp/_news2015/pdf/151118.pdf), [JRA-VAN's eleven G1/Jpn1 wins for Copano Rickey](https://jra-van.jp/fun/memorial/2010106548.html). Portraits are the original user-supplied Cygames/GameTora PNGs.

Reproduce with `node tools/import-horse-roster.mjs IMAGE_DIRECTORY GAMETORA_RECORDS_JSON JRA_HALL_HTML`, using UTF-8 snapshots. This copies original PNG bytes and writes `public/horse-roster.js`. Review changes and test before deployment; this is separate from the MAL catalogue importer.

## Tickets and odds

The server samples first place in proportion to frozen strengths, removes that horse, then repeats for remaining positions: the Plackett–Luce model. Cryptographic random integers drive production draws. Exact enumeration of all **1,320 ordered top-three outcomes** gives combination probabilities, so quotes and placement use the same model.

| Ticket                | Winning selection                      | Return factor |
| --------------------- | -------------------------------------- | ------------- |
| Win                   | First place                            | 80%           |
| Place                 | One runner in the top three            | 80%           |
| Bracket Quinella      | Brackets of first/second, either order | 77.5%         |
| Quinella              | First/second, either order             | 77.5%         |
| Wide (Quinella Place) | Any two runners in the top three       | 77.5%         |
| Exacta                | First/second in order                  | 75%           |
| Trio                  | Top three, any order                   | 75%           |
| Trifecta              | Top three in order                     | 72.5%         |

Conditions follow the [English JRA ticket guide](https://japanracing.jp/en/racing/go_racing/pdf/how_to_bet_en.pdf). Twelve runners make Place top-three. The eight colored brackets are `1,2,3,4,5,5,6,6,7,7,8,8`; same-bracket tickets require two runners in that bracket. WIN5 spans multiple races and is not offered.

Return factors follow [JRA's published rates](https://www.jra.go.jp/kouza/baken/), but this simulator uses **fixed odds**, not betting-pool payouts. `oddsTenths = max(10, floor(10 × factor / probability))`, allowing a tiny floating-point tolerance at exact decimal boundaries. Gross payout is `floor(stake × oddsTenths / 10)`, including the stake. Thus 100 credits at 4.7× pays 470, net +370. Rounding lowers expected return; the 1.0× minimum can raise the factor for highly likely selections.

The race card shows Win/Place multipliers and each runner's win chance. The builder quotes all combination probabilities/multipliers/returns. Backed runners have mint-highlighted lanes, names and portrait rims; bracket tickets highlight every runner in the selected brackets. The highlights preview added cart tickets and persist from purchased tickets after refresh. A cart supports 1–20 mixed tickets, stakes in multiples of 100 and a total limit of 100,000 credits. The server rejects impossible/duplicate runners, stale quotes and unaffordable carts before charging.

## API and persistence

- POST `/api/horse-prepare`: `{previousRace:null|id}`. Saves one field free; refresh cannot reroll pending races.
- POST `/api/horse-start`: `{race,version,tickets:[{kind,picks:[numbers],stake,oddsTenths}]}`. Validates/charges the whole cart, locks betting and saves one order, 2.5-second countdown and 22-second race.
- Both require a session and stable Idempotency-Key. Replays cannot charge or draw twice; foreign/stale races reject.
- The animation runs locally. At the finish, one compact authenticated GET `/api/game-state` settles winning tickets against the **server clock**, once. State/sign-in also settles an overdue race after disconnect. No browser animation can award credits. Payout remains hidden while running; the order is exposed only after betting closes.
- Typical traffic is two POSTs and one finish GET, plus existing periodic refreshes. Only twelve runners travel in game state; no catalogue scan or per-frame request is needed.
- Full race outcomes are bounded to the last 50 per player; older financial stake/payout/net rows remain for rankings. Race winnings do not increase earned-credit rankings. Current races follow canonical identity migration and explicit host gameplay resets.

Deployment preserves the original Game/amqtours-economy-v1 Durable Object, existing balances, catalogue and importer. Test mutations belong only in the local test database, never fake production bets or resets.
