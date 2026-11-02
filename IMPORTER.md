# MAL Catalogue Importer

The catalogue uses Tenrai's cached MAL API, not direct HTML scraping. One request runs at a time under a persisted lease, with at least 30 seconds between completed requests. Anime/cast discovery and up-to-100-entry favorites pages share the same pacing. MAL IDs, Japanese voice credits, Main/Supporting character roles, English/Romaji titles and 15-day refreshes are retained.

## November 1 Diagnosis

Production had 83,820 characters and 5,500 seiyuus. It was waiting after repeated Tenrai HTTP 429s, with discovery at anime page 411 / 10,266 titles and the favorites scan at people page 356. Paid Cloudflare background budgets were unpaused. The same anime listing page returned 200 from a single desktop diagnostic request. This supports a hosted public-access/rate-limit issue; the exact upstream cause was not present in the old saved errors. We did not reset any checkpoint, import historical batches again, rotate IPs or skip the current cooldown.

Tenrai documents public limits per IP (120/minute, 4/second), and Server Key limits per key (300/minute, 5/second). Our previous six requests/minute was already below the public limit; shared Cloudflare egress is a possible explanation, not a proven attribution. Tenrai serves pre-cached data from its own servers, so these requests do not individually scrape MAL.

## Secure Server Key Setup

1. Obtain a key using the Server Keys section at https://api.tenrai.org/documentation . Permanent keys are supporter benefits; the documentation also offers temporary keys through their Discord.
2. In Cloudflare Dashboard, open Workers & Pages → **amqtours-gatcha** → Settings → Variables and Secrets. Add **TENRAI_SERVER_KEY** as a **Secret**, then deploy. This belongs on the original game Worker, not the play alias. Do not paste the key into chat or commit it.
3. The importer sends it only as X-Server-Key to fixed Tenrai endpoints, with automatic redirects disabled (Workers-compatible `manual` mode; 3xx responses fail without following). Host status should show Server Key. Switching from public to authenticated quota preserves all cursors/cards and fences an old public request. It schedules an active waiting job under the independent authenticated quota. A paused job still requires Start / Resume.

The key is runtime-only. No key value is saved in catalogue metadata, host responses, diagnostics or browser assets. Removing a key preserves an existing public cooldown. HTTP 401/400/403 pause the job for operator action.

## Retries and Diagnostics

429s use a five-minute exponential local delay capped at 30 minutes; a longer Retry-After always takes precedence. Existing saved cooldowns remain intact on deployment. Other temporary failures keep the existing conservative backoff. A failed task stays selected until success rather than switching tasks as failures increment the request counter. Status reports the last request path, future successes, a bounded sanitized upstream message, selected rate-limit headers and Retry-After milliseconds. Denial bodies are limited to 4 KB and only whitelisted text is retained.

On November 2 KST a Server Key was installed as a Worker secret. The subsequent connection failure was traced to the unsupported Fetch redirect `error` mode; Cloudflare Workers rejects it before sending a request. The importer now uses `manual`, with a real Workers-runtime test verifying successful authenticated fetches and blocked redirects. Live checkpoint advancement is checked separately before claiming recovery. A self-hosted Jikan service is an alternative if Tenrai access remains unavailable, but it requires a separate backend and ongoing maintenance. See https://api.tenrai.org/faq .

## New Cards (24h)

`GET /api/catalog-recent?page=1` returns 40 mixed character/seiyuu cards first imported in the rolling past24hours, newest first, plus `total`, `hasMore`, `since`, `now` and `trackingSince`. Each card includes `firstImportedAt`. The Catalogue subtab uses this feed without changing the main menu. The indexed `catalog_arrivals` journal records only new Tenrai discoveries, once per identity; role promotion, favorite scans, rediscovery and host metadata edits do not count. Existing cards have no recoverable per-card import timestamps, so tracking begins with this deployment. Gameplay resets preserve the journal and catalogue.

## One-off MAL cards

Host catalogue imports accept optional non-negative integer favorite counts on MAL cards and synchronize their normal popularity rarity in the same transaction. Null or absent counts preserve existing popularity data. One-off imports do not change the background importer checkpoint or pacing state. They still follow the upstream service’s own limits. Reuse the same idempotency key for retries.
