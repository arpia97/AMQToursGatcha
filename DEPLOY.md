# Deploy the live shared game for free

Recommended: **Cloudflare Workers Free with a SQLite-backed Durable Object**. GitHub stores the code and serves the demo. The live player site and host console should use the same Cloudflare origin so cookies and API requests remain same-origin.

As checked on 2026-10-24, Cloudflare documents 100,000 Worker requests/day and free SQLite-backed Durable Objects, including 100,000 object requests/day, 5 million SQL rows read/day, 100,000 rows written/day, and 5 GB aggregate SQL storage. A single free-plan object has a smaller storage limit. Limits can change; consult the linked pricing/limits pages before launch. Free-plan quota exhaustion stops affected operations; it is not an unlimited service.

- [Worker pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Durable Object pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Durable Object limits](https://developers.cloudflare.com/durable-objects/platform/limits/)

## Current deployment

Live game: https://play.amqtours-gatcha.workers.dev/

Host console: https://play.amqtours-gatcha.workers.dev/host.html

The shorter address uses a tiny `play` Worker with a service binding to the existing `amqtours-gatcha` Worker. Both addresses share the original database and catalogue. The original repeated-name URL remains available; sessions are separate per hostname. Deploy the game with `pnpm deploy`, then the address alias with `pnpm deploy:short-url`. `wrangler.play.jsonc` intentionally has no Durable Object migration or database of its own. Do not rename or recreate the original economy Worker to change the public address.

The production HOST_TOKEN is saved in the local ignored `.production.vars` file. Keep it private for trusted external host-tool integration; it is no longer entered in the browser console. It is deployed as an encrypted runtime secret and is not part of GitHub or public assets. Authentication setup used the account's verified email and Wrangler OAuth. Only the arpia97 account (canonical Tours ID 368) can sign in to the host console. Player IDs and aliases automatically synchronize from the public AMQ Tours IDs worksheet every six hours. Issue host registration codes to allow those identities to register.

Tenrai discovery imports MAL characters and Japanese seiyuus in the background, including MAL portraits, character roles, and bilingual anime titles. Favorite scans refresh rarity every 15 days. Inspect progress in the host console; see [CATALOG.md](CATALOG.md). All host reset scopes preserve catalogues, import checkpoints, and rarity data. The old ACDB snapshot is retired. Production gameplay is not populated with fictional demo players.

## Option A: Deploy from your computer

1. Create a free Cloudflare account and select the Workers Free plan. You can use the included `workers.dev` address; purchasing a domain is unnecessary.
2. In this repository, install dependencies with `pnpm install`.
3. Run `pnpm exec wrangler login` and complete Cloudflare's browser sign-in.
4. Generate a new private token of at least 32 characters. For example, `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` prints one in your own terminal. Keep it in a password manager.
5. Run `pnpm exec wrangler secret put HOST_TOKEN` and paste that token at Wrangler's hidden prompt. Do not put it in the command line, GitHub files, or chat. If prompted to create the Worker, use the configured name `amqtours-gatcha`.
6. Run `pnpm deploy`. Wrangler creates the SQLite-backed Durable Object namespace and uploads static assets. No D1/R2 provisioning is needed.
7. Open the returned HTTPS `workers.dev` URL and `/host.html`. Provision the owner account for Tours ID 368 through the protected admin-account API, then sign in as arpia97.
8. Check automatic alias sync, populate the real catalog, configure prices and Main weight, and issue each player their registration code privately. A manual CSV import remains available. Then share the player URL.

If setting a secret before the initial deployment is unavailable for your account, run `pnpm deploy` first, set the secret, then deploy again. Trusted token integrations fail closed without HOST_TOKEN; console access requires the owner account. Public registration accepts the configured shared beta code only while enabled, otherwise individual host-issued codes.

The SQLite database persists across deployments. Keep the Durable Object class name, binding, named object ID, and `v1` migration stable. Changing these can create a separate empty economy. `Game` / `GAME` / `amqtours-economy-v1` are intentional persistent identifiers.

## Option B: Connect GitHub in Cloudflare

In Cloudflare, create a Worker by importing `arpia97/AMQToursGatcha` from GitHub, using the root directory and Wrangler configuration. Install with `pnpm install --frozen-lockfile`, validate with `pnpm check && pnpm test`, and deploy with `pnpm deploy`. Configure `HOST_TOKEN` as a **runtime secret**, not a public build variable. Cloudflare's interface may label the fields differently; choose Workers, not a static-only Pages export.

Future pushes can deploy automatically through that GitHub connection. This repository's own CI verifies and builds but does not deploy a live backend or contain Cloudflare credentials.

## GitHub Pages demo

The `Publish demo to GitHub Pages` workflow publishes `public/`. Repository Settings → Pages → Source must use **GitHub Actions**. On a `github.io` hostname, the frontend intentionally enables the labelled demo. Visiting the static host console cannot perform host operations. This demo is independent of live community accounts and shared credits.

## Backups and resets

Background discovery and index backfill track an app-local SQL budget and rest at 2 million read rows or 30,000 written rows per UTC day, leaving room within the free plan for gameplay and platform overhead. The host catalogue panel shows this estimate. Catalogue totals are maintained transactionally and housekeeping uses indexes instead of repeated full scans. These estimates do not cover other Workers or every platform operation; the account's Cloudflare metrics remain authoritative. If the account-wide free database allowance is exhausted, API requests return a retryable 503 mentioning the published daily reset time (00:00 UTC / 09:00 KST), while stored data remains intact. Retry-After is at most five minutes, including when enforcement persists after the published boundary; it does not incorrectly direct clients to wait another full day.

The host catalogue panel also breaks SQL row estimates down into catalogue import/favorites, requests, alias synchronization, indexing, maintenance and initialization. Attribution starts with this release: older same-day counters remain explicitly unattributed. Synchronous storage scopes end before external fetches await, so interleaved player activity is not charged to an importer. Checkpoint/platform alarm operations are excluded from these estimates; this is diagnostic accounting, not a Cloudflare billing report.

Card metadata lookups batch local IDs and packed catalogue/favorites buckets, with a bounded 5,000-card, five-minute cache. Catalogue and popularity writes invalidate it immediately; rollback also invalidates it. Import/alias/index checkpoints preserve card caches. Identical casts and unchanged aliases skip writes; favorites refreshes write only dirty buckets and change the histogram only when counts change. Shop replenishment uses bounded random bucket draws instead of reading the entire combined catalogue. The existing catalogue, wallets, sessions, receipts, import checkpoints and original Durable Object identity remain intact.

A local Workers SQL-cursor benchmark with 601 players, 2,000 catalogue cards, 1,000 owned cards and 10,000 ledger rows measured warm full account refreshes at 1,044 → 38 SQL calls and 6,689 → 5,684 rows read (zero writes), before/after this release. Random weekly card overlap can vary the response's referenced-card count. This measures full refreshes, not Mahjong moves, which already use the compact game-state path. Production savings depend on collections, traffic and cache warmth.

Review Cloudflare's [SQLite-backed storage and point-in-time recovery documentation](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) before using destructive reset tools. Keep a recovery plan appropriate to the account/plan. The host console exports the latest 100 wallet movements for review; that export is not a full database backup or restore mechanism.

Reset warnings are enforced both in the UI and API. Every reset scope preserves catalogues, import checkpoints, and rarity data. A gameplay reset keeps identities and credentials; full player deletion removes them and resets prices. Automatic alias sync recreates source IDs as unregistered identities afterward, without recovering credentials or gameplay. The externally configured host token remains available for recovery. Weekly auctions and shop inventory regenerate from the protected catalogues.
