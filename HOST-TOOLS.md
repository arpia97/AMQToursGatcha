# Host console and external integration

The player website never exposes host powers. Sign in at `/host.html` with an administrator account to use every host tool. Existing player-site administrator sessions are also accepted. The deployment HOST_TOKEN remains available for external integrations and recovery; when used in the console it stays in that tab's memory and is not saved to localStorage.

## Import AMQ identities

Export the intended AMQ Tours ID/alias source to this format:

```csv
id,name,aliases
00123,ExamplePlayer,oldalias|anotheralias
00456,SecondPlayer,secondalias
```

IDs are strings: leading zeros are preserved. A player is identified by the stable AMQ Tours ID, never by a mutable username. Imports preserve wallets, cards, account access, username history, and previously imported aliases. Any conflict with another player's alias or username history rejects the entire import. A new authoritative AMQ alias that collides with a username needs explicit identity resolution; the importer does not reassign it silently.

Issue a one-use registration code from Players & access. A registered player can log in with an AMQ ID or imported alias. Host account-access reset issues a new registration code and revokes sessions, while preserving gameplay. This differs from the destructive **Reset tools** tab.

## Activity counts and pick’ems

When granting reporting, counting, or participation credits, include a stable **tour identifier**. Each player receives at most one profile count for each category and tour identifier, even if additional credit grants are made for the same task. Different categories count separately. The audit note is displayed in wallet activity. API callers without an event field fall back to the note as the identifier.

Profile pick’em accuracy is correct winning-team predictions divided by all **settled matches that player entered**. Unresolved matches and matches they skipped are excluded. Exact-score credit payouts do not affect the winner-accuracy percentage. No settled entries displays `—`.

## Terminal tool

Set `AMQ_HOST_TOKEN` in the environment, from a secure local source. Do not place it in a JSON payload, command argument, or committed file.

Create `grant.json` locally:

```json
{
  "player": "00123",
  "amount": 300,
  "reason": "reporting",
  "event": "usual-2026-10-24-42",
  "note": "Usual #42 reporting"
}
```

Then run:

```sh
node tools/host.mjs grant grant.json --url https://YOUR-WORKER.workers.dev --key usual42-reporting-00123
```

Reuse the **same key and exact payload** for a retry. A key reused with a different payload is rejected. Choose different keys for different intended grants. Generated request IDs are printed by the tool so they can be reused after a network interruption.

Your existing AMQ Tours Python script can call the same HTTPS JSON endpoint directly. Send `Authorization: Bearer <token>`, `Content-Type: application/json`, and `Idempotency-Key: <stable unique operation ID>`. Keep the token in a local secret, never in the sheet or player frontend. No changes have been made to the existing host script.

## Host endpoints

All paths start with `/api/host/`. GET `state` reads console data; all other listed operations are JSON POSTs.

| Action         | Body                                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `players`      | `{"players":[{"id":"00123","name":"Example","aliases":["old"]}]}`                                                                                                                                |
| `invite`       | `{"player":"00123"}` → one-use code (valid seven days)                                                                                                                                           |
| `reset`        | `{"player":"00123"}` → revoke account access, issue new registration code                                                                                                                        |
| `grant`        | `{"player":"00123","amount":100,"reason":"counting","event":"tour42","note":"Tour 42"}`                                                                                                          |
| `pickem`       | `{"title":"Final","tour":"Usual","teamA":"A","teamB":"B","ends":1792857600000,"winnerReward":300,"scoreReward":100}`                                                                             |
| `settle`       | `{"pickem":1,"scoreA":3,"scoreB":2}`                                                                                                                                                             |
| `settings`     | `{"character":500,"seiyuu":500,"mainWeight":80}`                                                                                                                                                 |
| `catalog`      | `{"cards":[{"id":"provider-character-123","kind":"character","name":"Example","series":"Series","role":"main","image":"https://example.com/image.jpg","source":"https://example.com/profile"}]}` |
| `reset-player` | `{"player":"00123","confirmation":"RESET PLAYER 00123"}`                                                                                                                                         |
| `reset-all`    | `{"deleteRegistry":false,"confirmation":"RESET ALL GAME DATA"}`                                                                                                                                  |
| `reset-all`    | `{"deleteRegistry":true,"confirmation":"DELETE EVERYTHING"}`                                                                                                                                     |

Credit grant reasons: `reporting`, `counting`, `participation`, or `other`. Grants must be positive integers. Pick’em deadlines are Unix timestamps **in milliseconds**, at least one minute in the future. Settlement is allowed only after the deadline and cannot be repeated. Drawn/tied match results are not supported in this first version.

Catalog imports accept 500 entries per request; the browser console chunks larger files. Reimporting an existing ID updates metadata and does not create a new card. Character role is `main`, `supporting`, or `unknown`; missing character role defaults to Supporting. Unknown uses weight 100. Seiyuu role inputs are ignored. Image and source URLs must be HTTPS. Inspect upstream terms and ensure the catalog/image use fits your deployment.

## Expand the catalog

Use Tenrai discovery from the Catalog & prices tab. It imports MAL character portraits, Main/Supporting roles, bilingual anime titles and Japanese voice actors. The same section shows discovery/favorite scan progress, pause/resume, and a manual favorites refresh. See [CATALOG.md](CATALOG.md).

GET /api/catalog?kind=character&q=Frieren&page=1 returns a public 40-card page. Search checks both title languages. Host role corrections override source classification without creating a second identity. JSON imports accept series_romaji and series_english. Actors remain unclassified.

All reset scopes protect the character/seiyuu catalogues, bilingual titles, import checkpoints and rarity data. Full registry deletion still revokes every account/session and resets gameplay/prices. The one-time ACDB retirement migration is separate and never clears the Tenrai catalogue.

## Administrator accounts

The protected `POST /api/host/admin-account` accepts `{player, password}` (optional `name`) and creates an administrator for an unregistered AMQ player ID. It does not overwrite existing passwords or grant privileges through ordinary registration. Administrator passwords support 8–256 characters; one-use-code registration still requires 12. Passwords are salted and hashed. Sessions are HttpOnly and SameSite Strict. Locking an account-based console signs out that session. Gameplay resets retain administrator roles; deleting the entire registry also deletes administrator accounts, so retain the independent deployment token for recovery.

## Seiyuu import controls (Tenrai)

The `jikan-*` endpoint names are retained for compatibility. Requests now use Tenrai at `https://api.tenrai.org/v1`, which preserves Jikan v4 schemas and MAL IDs. Jikan’s public instance was discontinued on October 1, 2026 ([maintainer announcement](https://github.com/jikan-me/jikan-rest/issues/613)).

GET `jikan-status` returns source-import progress, including the active provider. POST `jikan-start` starts or resumes the finite anime-catalog scan; POST `jikan-pause` pauses it. Use empty JSON objects for these controls. The host Catalog & prices tab exposes these controls and refreshes progress every 30 seconds. Jobs run on Cloudflare alarms, so a local computer or open browser is unnecessary. Temporary errors retain the same page/title and increase the delay; HTTP 400/403 pauses for inspection. Existing MAL actor IDs are preserved, and existing actor metadata is not overwritten by the discovery pass.

## Character migration and favorite refresh API

- GET /api/host/acdb-retirement: authenticated preview of affected ACDB inventory, avatars, auctions, overrides and manifest; save privately before replacement.
- POST /api/host/replace-acdb: body {"confirmation":"REPLACE ACDB WITH TENRAI"} plus an Idempotency-Key. Retires only ACDB and enables combined Tenrai discovery. Retries preserve progress.
- POST /api/host/favorites-refresh: body {"intervalDays":15}. Starts a batch scan, or updates an active scan's interval without losing its checkpoint. Does not bypass backoff. All upstream work uses the shared ten-second interval.
- GET /api/host/jikan-status: discovery plus nested favorites scan state. Legacy jikan-start/jikan-pause paths control the combined Tenrai job.

Catalogues and import metadata are preserved even with reset-all/deleteRegistry:true. No host reset endpoint clears them. AG is the abbreviated Anything Goes tier; rarity is derived from favorite counts, not submitted in host catalogue JSON.
