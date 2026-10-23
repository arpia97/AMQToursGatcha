# AMQ Tours Gatcha

A collection game for the AMQ Tours community: earn credits, collect characters and seiyuus, bid on weekly auctions, and predict tour results.

**[Open the shared Cloudflare game](https://play.amqtours-gatcha.workers.dev/)** · [GitHub Pages demo](https://arpia97.github.io/AMQToursGatcha/) · [Deploy the shared game](DEPLOY.md) · [Host tool / API](HOST-TOOLS.md)

The GitHub Pages site is an explicitly labelled **browser-only demo** with fictional players. It does not award real community credits. The same frontend and the shared backend are deployed together on Cloudflare Workers. No paid database, separate server, or custom domain is required for a small deployment within Cloudflare's free allowances.

## Included

- Host-issued, one-use registration codes linked to stable AMQ Tours IDs; automatic alias-sheet synchronization every six hours, plus ID and alias sign-in.
- One-time 1,000-credit starter grant for every identity, including existing users. Daily sign-in automatically adds 100 credits and five cards chosen uniformly from the combined character/seiyuu pool, resetting at midnight in `Asia/Seoul`.
- Separate authenticated host console at `/host.html`, plus a command-line tool for external host scripts.
- Credit awards for reporting, counting, and participation, with an audit note and distinct tour identifier.
- Free pick’em entry with a deadline, editable predictions before closing, and one-time settlement by the host. Correct winner and each exact team score pay separately.
- Two weekly auctions: five distinct character cards and five distinct seiyuu cards, chosen without gender or role filters. Weeks start Monday at 00:00 UTC / 09:00 KST. A scheduled Durable Object alarm rotates the lineup even when the page is closed.
- Credit holds on bids, immediate outbid refunds, and one-time winner claims after closing.
- Five-card packs with replacement. Duplicates can appear in the same pack.
- Character pack weights: Main `80`, Supporting `100` by default. The host can adjust Main weight from 1–99. Gender does not affect odds. Seiyuus have **no classification and equal odds**. Auction selection remains unweighted.
- Enhancement costs 1, 2, 4, 8… extra copies. One base copy stays in the inventory. No additional credit fee; maximum level 20.
- Cumulative earned-credit, current balance, gambling profit, and gambling loss rankings. Spending, refunds, trading proceeds, and gambling payouts do not inflate Cumulative earnings.
- Searchable public profiles with current username, all previous usernames, AMQ aliases, available credits, tour participation/counting/reporting counts, and pick’em winner accuracy.
- Profile pictures selected from owned cards. Frames progress from silver to blue, violet, gold, and iridescent at levels 1, 2, 4, 6, and 10. Avatar levels follow the inventory automatically.
- Username changes are free. Another player's registered AMQ aliases and historical usernames are reserved, case-insensitively.
- Six-card profile showcases, collection completion by card type, and catalogue filters for rarity and character role.
- Pick’em history with Open, Locked, and Settled states, newest first; an open pick’em replaces the overview hero.
- Weekly fixed-price shop with five characters and five seiyuus, one shared stock per card, rotating Monday at 00:00 UTC. Prices are provisional and based on rarity.
- User Marketplace and User Auctions, with escrowed cards, enhanced-level transfers, immediate outbid refunds, and one-time seller payouts. User auctions last 1–168 hours, with a minimum opening bid and optional buyout. Withdrawals are allowed before the first bid; buyouts deliver the enhanced card immediately.
- Catalogue page-number input and nearby-page selection, green active searches, and red empty-result searches. My collection includes a paginated anime progress board with unique collected character counts and completion bars for each primary anime.
- Premium five-card packs at 2,000 credits by default, favoring rarer cards. Prices and rarity weights are provisional; see [CATALOG.md](CATALOG.md).
- Coin Flip, High / Low, and Lucky Seven credit games, with displayed odds, payouts, and stakes of 10–10,000 credits.
- Host reset tools for one player, all gameplay, or all player accounts, with warnings and exact typed confirmation phrases. Every scope protects the catalogues.

## Local development

Requires Node.js 24 and pnpm 11.25 or newer.

```sh
pnpm install
```

Generate a random host token locally and save it in the ignored `.dev.vars` file:

```sh
node --input-type=module -e "import {writeFileSync} from 'node:fs'; import {randomBytes} from 'node:crypto'; writeFileSync('.dev.vars','HOST_TOKEN='+randomBytes(32).toString('hex')+'\n')"
pnpm dev
```

Visit `http://localhost:8787/?demo=1` for the sandbox, `http://localhost:8787/` for the real local backend, and `/host.html` for the host console. Open `.dev.vars` locally to obtain your development token. It is not a production token. Production data starts empty; demo state never seeds the backend automatically.

## Validation

```sh
pnpm check
pnpm test
pnpm build
```

The test suite uses real SQLite transactions for the shared economy, weighted draws, aliases, profiles, and reset operations. `pnpm build` performs a Cloudflare deployment dry run. With the local dev server running, `node tools/smoke.mjs` checks the actual API, auth, and concurrent mutations using synthetic players. It creates local test data only. Do not point it at production.

## Initial data and remaining setup

Characters and Japanese seiyuus now import gradually from the MAL catalogue through Tenrai, using MAL IDs and portraits. Character roles use documented Main/Supporting credits. Cards retain English and Romaji/default anime titles, with a persistent display toggle and search across both versions. The old ACDB snapshot and public download have been retired.

Popularity rarity uses separate character/seiyuu favorite-count percentiles: AG <0.1%, Ubers <0.5%, SSS <1%, SS <2.5%, S <5%, A <10%, B <20%, C <40%, and D otherwise. Tied counts share an averaged rank. Favorites refresh automatically in batches every 15 days, with manual controls in the host console. Rarity does not change enhancement levels or normal-pack odds; premium packs apply additional rarity weights. Grades are provisional while the initial import grows the pool.

The importer and favorite scans share one request every ten seconds, persisted checkpoints, leases, and outage backoff. They run on Cloudflare when your PC is off. All host reset scopes preserve the catalogues, import progress, and popularity data. The 22-card browser demo remains a small sample. See [CATALOG.md](CATALOG.md) for coverage, source rules, migration, rarity definitions and scheduling.

The real AMQ Tours player/alias registry is **not committed to this public repository**. The backend reads the public IDs worksheet every six hours, with a manual sync button in the host console. Existing legacy accounts migrate to their canonical numeric ID when unambiguous, retaining credentials and gameplay. Exact IDs take precedence over numeric aliases at login; use `alias:NAME` to explicitly select an alias. Registration still requires a host-issued code. See [HOST-TOOLS.md](HOST-TOOLS.md) for source details and conflict handling. AMQ Tours ratings, statistics, and the existing Python host application are unchanged.

## Architecture

`public/` is a buildless, responsive frontend. `src/worker.js` serves the API and static assets. One SQLite-backed Durable Object owns the community economy. `src/engine.js` executes economic mutations synchronously inside transactions, preventing concurrent overspending. Mutations require an idempotency key. Passwords use salted PBKDF2; session tokens are hashed in storage and sent in HttpOnly SameSite cookies. Host access accepts an administrator account session or a deployment secret held in memory by the host console. Administrator permissions are checked in the database on every host request. Same-origin JSON requests and login throttles protect mutation endpoints.

This design targets an AMQ community, not an unlimited global service. Catalog browsing/search and user listings are paginated (40 cards), rankings use 50-player pages, and pick’em history uses 20-match pages. Shared state contains only referenced card metadata. Bulk metadata uses bounded SQLite JSON chunks to keep initial row writes low. Profile search shows up to 50 matches. Free service allowances and upstream image availability still apply.

Collection and search inspiration: [karitham/WaifuBot](https://github.com/karitham/WaifuBot). This is an independent implementation of the requested AMQ economy, rather than a deployment of that Discord bot.
