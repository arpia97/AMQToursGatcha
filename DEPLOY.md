# Deploy the live shared game for free

Recommended: **Cloudflare Workers Free with a SQLite-backed Durable Object**. GitHub stores the code and serves the demo. The live player site and host console should use the same Cloudflare origin so cookies and API requests remain same-origin.

As checked on 2026-10-24, Cloudflare documents 100,000 Worker requests/day and free SQLite-backed Durable Objects, including 100,000 object requests/day, 5 million SQL rows read/day, 100,000 rows written/day, and 5 GB aggregate SQL storage. A single free-plan object has a smaller storage limit. Limits can change; consult the linked pricing/limits pages before launch. Free-plan quota exhaustion stops affected operations; it is not an unlimited service.

- [Worker pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Durable Object pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Durable Object limits](https://developers.cloudflare.com/durable-objects/platform/limits/)

## Current deployment

Live game: https://amqtours-gatcha.amqtours-gatcha.workers.dev/

Host console: https://amqtours-gatcha.amqtours-gatcha.workers.dev/host.html

The production HOST_TOKEN is saved in the local ignored `.production.vars` file. Open it locally to unlock the host console; keep it private. It is deployed as an encrypted runtime secret and is not part of GitHub or public assets. Authentication setup used the account's verified email and Wrangler OAuth. The administrator account can sign in directly at the host console. Additional AMQ players and aliases still need a host import.

The ACDB character snapshot is seeded separately from code deployment. See [CATALOG.md](CATALOG.md). The 10 sample seiyuus are an initial pool. Jikan discovery can expand it in the background; inspect its actual status in the host console. Kitsu-wide actor import is not active. Production gameplay has not been populated with fictional demo players.

## Option A: Deploy from your computer

1. Create a free Cloudflare account and select the Workers Free plan. You can use the included `workers.dev` address; purchasing a domain is unnecessary.
2. In this repository, install dependencies with `pnpm install`.
3. Run `pnpm exec wrangler login` and complete Cloudflare's browser sign-in.
4. Generate a new private token of at least 32 characters. For example, `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` prints one in your own terminal. Keep it in a password manager.
5. Run `pnpm exec wrangler secret put HOST_TOKEN` and paste that token at Wrangler's hidden prompt. Do not put it in the command line, GitHub files, or chat. If prompted to create the Worker, use the configured name `amqtours-gatcha`.
6. Run `pnpm deploy`. Wrangler creates the SQLite-backed Durable Object namespace and uploads static assets. No D1/R2 provisioning is needed.
7. Open the returned HTTPS `workers.dev` URL and `/host.html`. Unlock the host console with the token you just set.
8. Import your AMQ player CSV, populate the real catalog, configure prices and Main weight, and issue each player their registration code privately. Then share the player URL.

If setting a secret before the initial deployment is unavailable for your account, run `pnpm deploy` first, set the secret, then deploy again. The host console fails closed until a valid HOST_TOKEN is set; public registration still requires a host-issued code.

The SQLite database persists across deployments. Keep the Durable Object class name, binding, named object ID, and `v1` migration stable. Changing these can create a separate empty economy. `Game` / `GAME` / `amqtours-economy-v1` are intentional persistent identifiers.

## Option B: Connect GitHub in Cloudflare

In Cloudflare, create a Worker by importing `arpia97/AMQToursGatcha` from GitHub, using the root directory and Wrangler configuration. Install with `pnpm install --frozen-lockfile`, validate with `pnpm check && pnpm test`, and deploy with `pnpm deploy`. Configure `HOST_TOKEN` as a **runtime secret**, not a public build variable. Cloudflare's interface may label the fields differently; choose Workers, not a static-only Pages export.

Future pushes can deploy automatically through that GitHub connection. This repository's own CI verifies and builds but does not deploy a live backend or contain Cloudflare credentials.

## GitHub Pages demo

The `Publish demo to GitHub Pages` workflow publishes `public/`. Repository Settings → Pages → Source must use **GitHub Actions**. On a `github.io` hostname, the frontend intentionally enables the labelled demo. Visiting the static host console cannot perform host operations. This demo is independent of live community accounts and shared credits.

## Backups and resets

Review Cloudflare's [SQLite-backed storage and point-in-time recovery documentation](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) before using destructive reset tools. Keep a recovery plan appropriate to the account/plan. The host console exports the latest 100 wallet movements for review; that export is not a full database backup or restore mechanism.

Reset warnings are enforced both in the UI and API. A gameplay reset keeps identity and catalog data; a full deletion removes player credentials and the catalog as well. The externally configured host token remains so you can initialize the empty game again. Re-importing at least five cards per type starts new weekly auctions.
