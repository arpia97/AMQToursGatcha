# AMQ Tours Gatcha

A collection game for the AMQ Tours community: earn credits, collect characters and seiyuus, bid on weekly auctions, and predict tour results.

**[Open the GitHub Pages demo](https://arpia97.github.io/AMQToursGatcha/)** · [Deploy the shared game](DEPLOY.md) · [Host tool / API](HOST-TOOLS.md)

The GitHub Pages site is an explicitly labelled **browser-only demo** with fictional players. It does not award real community credits. The same frontend and a working shared backend are ready to deploy together on Cloudflare Workers. No paid database, separate server, or custom domain is required for a small deployment within Cloudflare's free allowances.

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

The included starter catalog has **12 characters and 10 voice actors**, with remote MyAnimeList portraits. It is a small review/test pool, not the full anime universe. Classification is per associated series and can be adjusted in the host console. Expand the catalog before inviting the community. Names and images were read from the linked source profiles; artwork and portraits retain their owners' rights.

The optional `tools/import-anilist.mjs` builds a larger catalog, page by page, from AniList. It uses a character's most popular associated anime to derive the displayed series and Main/Supporting role; a host can override that role. Staff entries are limited to people whose listed occupation includes voice actor. The import has no gender filter. Provider blocking and rate limits can interrupt it; completed pages are written after every response. AniList was blocked from the development environment, so this optional external-provider import has not been verified end to end here. JSON imports and the bundled starter catalog were verified.

Do not import the same identity from both MAL and AniList without deduplicating/mapping provider IDs: those would otherwise become separate cards. Choose one catalog ID scheme before community launch.

The real AMQ Tours player/alias registry is **not committed to this public repository**. Import a CSV through the host console. Automatic Google Sheets synchronization is not configured. AMQ Tours ratings, statistics, and the existing Python host application are unchanged; the separate command-line tool provides a supported integration point.

## Architecture

`public/` is a buildless, responsive frontend. `src/worker.js` serves the API and static assets. One SQLite-backed Durable Object owns the community economy. `src/engine.js` executes economic mutations synchronously inside transactions, preventing concurrent overspending. Mutations require an idempotency key. Passwords use salted PBKDF2; session tokens are hashed in storage and sent in HttpOnly SameSite cookies. Host access uses a deployment secret held in memory by the host console. Same-origin JSON requests and login throttles protect mutation endpoints.

This design targets an AMQ community, not an unlimited global service. Catalog responses currently include the complete active pool, rankings show up to 100 earners, and profile search shows up to 50 matches. Free service allowances and upstream image availability still apply. A very large catalog or community would need pagination and quota monitoring.

Collection and search inspiration: [karitham/WaifuBot](https://github.com/karitham/WaifuBot). This is an independent implementation of the requested AMQ economy, rather than a deployment of that Discord bot.
