# AMQ Tours Gatcha

A collection game for the AMQ Tours community: earn credits, collect characters and seiyuus, bid on weekly auctions, and predict tour results.

**[Open the shared Cloudflare game](https://amqtours-gatcha.amqtours-gatcha.workers.dev/)** · [GitHub Pages demo](https://arpia97.github.io/AMQToursGatcha/) · [Deploy the shared game](DEPLOY.md) · [Host tool / API](HOST-TOOLS.md)

The GitHub Pages site is an explicitly labelled **browser-only demo** with fictional players. It does not award real community credits. The same frontend and the shared backend are deployed together on Cloudflare Workers. No paid database, separate server, or custom domain is required for a small deployment within Cloudflare's free allowances.

## Included

- Host-issued, one-use registration codes linked to stable AMQ Tours IDs; ID and alias sign-in.
- 100-credit daily bonus, resetting at midnight in `Asia/Seoul`.
- Separate authenticated host console at `/host.html`, plus a command-line tool for external host scripts.
- Credit awards for reporting, counting, and participation, with an audit note and distinct tour identifier.
- Free pick’em entry with a deadline, editable predictions before closing, and one-time settlement by the host. Correct winner and each exact team score pay separately.
- Two weekly auctions: five distinct character cards and five distinct seiyuu cards, chosen without gender or role filters. Weeks start Monday at 00:00 UTC / 09:00 KST. A scheduled Durable Object alarm rotates the lineup even when the page is closed.
- Credit holds on bids, immediate outbid refunds, and one-time winner claims after closing.
- Five-card packs with replacement. Duplicates can appear in the same pack.
- Character pack weights: Main `80`, Supporting `100` by default. The host can adjust Main weight from 1–99. Gender does not affect odds. Seiyuus have **no classification and equal odds**. Auction selection remains unweighted.
- Enhancement costs 1, 2, 4, 8… extra copies. One base copy stays in the inventory. No additional credit fee; maximum level 20.
- Lifetime-credit rankings independent of spending or bid refunds.
- Searchable public profiles with current username, all previous usernames, AMQ aliases, available credits, tour participation/counting/reporting counts, and pick’em winner accuracy.
- Profile pictures selected from owned cards. Frames progress from silver to blue, violet, gold, and iridescent at levels 1, 2, 4, 6, and 10. Avatar levels follow the inventory automatically.
- Username changes are free. Another player's registered AMQ aliases and historical usernames are reserved, case-insensitively.
- Host reset tools for one player, all gameplay, or the entire registry/catalog, with warnings and exact typed confirmation phrases.
- Reserved gambling tab; no games implemented yet.

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

The ACDB snapshot contains **70,029 anime-linked character records** from the provider's published SQL exports. Main Character and Protagonist records map to Main (8,703); Supporting/other assigned roles map to Supporting (11,195); Unsorted stays unknown (50,131) with weight 100. TV anime, movies, OVA and ONA are included; there is no gender filter. Stable ACDB IDs are retained, including separate series/age variants. This is a dated provider snapshot, not a promise of every character ever created.

See [CATALOG.md](CATALOG.md) for repeatable bulk import, resumable uploads, provenance, licensing, and role corrections. The adapted database is freely downloadable under ODbL from `public/data/acdb-catalog.json.gz`, with [attribution](public/data/README.md). Portraits/artwork retain their owners' rights.

The 22-card demo/starter includes 12 MAL characters and 10 voice actors. For a live ACDB deployment, import **only its 10 seiyuus** to avoid duplicate character identities. ACDB's exports do not provide a complete voice-actor portrait catalog. A resumable Tenrai importer (Jikan-compatible) now discovers seiyuus from Japanese voice credits. It reuses the starter MAL person IDs and runs on Cloudflare with a ten-second request interval, saved checkpoints and outage backoff. The host console shows progress and pause/resume controls. Jikan’s public service closed on October 1, 2026; Tenrai is a maintainer-listed replacement. Upstream availability determines when new records can be added.

AniList's API terms prohibit mass collection or storage. The old optional AniList helper has been removed; use the published ACDB export for the character bulk seed.

The real AMQ Tours player/alias registry is **not committed to this public repository**. Import a CSV through the host console. Automatic Google Sheets synchronization is not configured. AMQ Tours ratings, statistics, and the existing Python host application are unchanged; the separate command-line tool provides a supported integration point.

## Architecture

`public/` is a buildless, responsive frontend. `src/worker.js` serves the API and static assets. One SQLite-backed Durable Object owns the community economy. `src/engine.js` executes economic mutations synchronously inside transactions, preventing concurrent overspending. Mutations require an idempotency key. Passwords use salted PBKDF2; session tokens are hashed in storage and sent in HttpOnly SameSite cookies. Host access accepts an administrator account session or a deployment secret held in memory by the host console. Administrator permissions are checked in the database on every host request. Same-origin JSON requests and login throttles protect mutation endpoints.

This design targets an AMQ community, not an unlimited global service. Catalog browsing/search is paginated (40 cards), while shared state contains only referenced card metadata. Bulk metadata uses bounded SQLite JSON chunks to keep initial row writes low. Rankings show up to 100 earners, and profile search shows up to 50 matches. Free service allowances and upstream image availability still apply.

Collection and search inspiration: [karitham/WaifuBot](https://github.com/karitham/WaifuBot). This is an independent implementation of the requested AMQ economy, rather than a deployment of that Discord bot.
