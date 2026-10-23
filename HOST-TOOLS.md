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

Follow [CATALOG.md](CATALOG.md) to seed ACDB's published exports. Large snapshots use authenticated `acdb-chunks` and `acdb-activate` endpoints; the upload helper saves its checkpoint locally and activation rejects incomplete or inconsistent indexes. Current catalogs remain available until successful activation. GET `/api/catalog?kind=character&q=Frieren&page=1` browses/searches a 40-card page publicly. The host role form searches that same catalog and saves per-card overrides.

Seiyuus have no role classification. ACDB's exports do not contain a complete voice-actor portrait database. Keep a single stable provider ID per actor and resolve identities before combining sources.

## Administrator accounts

The protected `POST /api/host/admin-account` accepts `{player, password}` (optional `name`) and creates an administrator for an unregistered AMQ player ID. It does not overwrite existing passwords or grant privileges through ordinary registration. Administrator passwords support 8–256 characters; one-use-code registration still requires 12. Passwords are salted and hashed. Sessions are HttpOnly and SameSite Strict. Locking an account-based console signs out that session. Gameplay resets retain administrator roles; deleting the entire registry also deletes administrator accounts, so retain the independent deployment token for recovery.

## Seiyuu import controls (Tenrai)

The `jikan-*` endpoint names are retained for compatibility. Requests now use Tenrai at `https://api.tenrai.org/v1`, which preserves Jikan v4 schemas and MAL IDs. Jikan’s public instance was discontinued on October 1, 2026 ([maintainer announcement](https://github.com/jikan-me/jikan-rest/issues/613)).

GET `jikan-status` returns source-import progress, including the active provider. POST `jikan-start` starts or resumes the finite anime-catalog scan; POST `jikan-pause` pauses it. Use empty JSON objects for these controls. The host Catalog & prices tab exposes these controls and refreshes progress every 30 seconds. Jobs run on Cloudflare alarms, so a local computer or open browser is unnecessary. Temporary errors retain the same page/title and increase the delay; HTTP 400/403 pauses for inspection. Existing MAL actor IDs are preserved, and existing actor metadata is not overwritten by the discovery pass.
