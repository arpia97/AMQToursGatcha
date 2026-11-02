# MAL catalogue through Tenrai

Characters and Japanese voice actors are discovered from the public MyAnimeList catalogue through [Tenrai](https://api.tenrai.org/llms.txt). Tenrai serves its own collected data and uses MAL IDs and the Jikan v4 response format. Jikan's public instance closed on October 1, 2026; compatibility module and `jikan-*` endpoint names remain for existing tools.

## Discovery and character identities

The importer pages `/anime?order_by=mal_id&sort=asc&limit=25&page=N`, then reads each `/anime/{id}/characters` response. One response provides character portraits, Main/Supporting roles, favorite counts, and Japanese voice credits with actor portraits and favorite counts. Only real MAL portraits and valid identities enter the pool; missing images and undocumented character roles are skipped. There is no gender filter. Actors have no Main/Supporting classification.

Character IDs are `mal-character-{id}`; actor IDs are `mal-person-{id}`. Repeated appearances do not create a second collectible. The first Main appearance becomes the character's primary anime; later Supporting credits cannot demote it. Host overrides take precedence. Cards record `series_romaji` (MAL's default title) and `series_english` separately. The viewer's title preference is saved in their browser; missing English titles fall back to the default. Search checks both title versions regardless of display preference.

Character metadata is kept in bounded buckets of at most 500 MAL identities, with Main/Supporting counts and search indexes. Pack draws and auctions read bounded buckets. Public browsing returns 40 cards per page; shared state includes only referenced metadata. Host JSON imports accept optional bilingual title fields and never set popularity tiers directly.

## Popularity rarity

Characters and seiyuus are ranked separately within the imported eligible pools using their MAL favorite counts. Missing favorites are Pending, never an invented zero. Zero is valid when reported by the source. Equal counts share their average ordinal rank. The top percentile is `100 * (strictly greater count + (tie count - 1) / 2) / ranked population`. Ties never split between tiers, and a large zero-favorite tie stays near the bottom.

| Tier               | Cumulative top-percentile cutoff |
| ------------------ | -------------------------------: |
| AG (Anything Goes) |                           < 0.1% |
| Ubers              |                           < 0.5% |
| SSS                |                             < 1% |
| SS                 |                           < 2.5% |
| S                  |                             < 5% |
| A                  |                            < 10% |
| B                  |                            < 20% |
| C                  |                            < 40% |
| D                  |             Remaining population |

Grades are computed from sparse favorite-count histograms when cards are returned, so an updated count does not require rewriting every card. Grades are provisional while discovery grows the population. Popularity rarity is separate from enhancement level and does not change normal-pack odds.

Normal packs choose every eligible card with equal probability within the selected type, regardless of Main/Supporting role or rarity. Premium packs cost 1,000 credits for five cards by default. Every AG, Ubers, SSS, SS and S card has exactly double its normal probability; only D funds this increase. If S-and-higher has normal probability p and D has probability q, premium has 2p S-and-higher and q−p for D. A, B, C and Pending probabilities remain unchanged. Five independent draws permit duplicates; no rarity is guaranteed. If the imported pool cannot supply enough D probability, premium packs temporarily reject purchases without charging. Prices are editable; the old mainWeight API field is retained for compatibility but has no effect on current pack odds. Per-object catalogue caches are invalidated on catalogue/favorites writes.

Catalogue search accepts a rarity filter and a Main/Supporting/Unsorted role filter for characters. Seiyuus have only the rarity filter. Filters combine with either title language or name search and paginate 40 matching cards at a time. No gender classification is used.

## Gentle automatic refresh

One persisted scheduler handles discovery and favorite refreshes. All upstream work shares one request at a time and a minimum ten-second interval (six requests/minute). Discovery gets four out of every five requests while a favorite scan is active. Favorites use `/characters` and `/people` pages of up to 100 profiles in stable MAL ID order. Only favorite counts for existing eligible cards are retained; biographies and unrelated staff records are discarded.

The first favorite scan starts with character discovery; subsequent scans start **15 days after the previous scan completes**. After discovery finishes, the scheduler sleeps between scans. The host console shows progress, last completion, and next due time, with manual refresh and interval controls. Pausing the importer pauses all upstream requests. Updating an already-running scan preserves its checkpoint. Periodic scans refresh favorites, not the title catalogue; a future discovery sweep is needed to discover anime added after the initial pass.

Each request has a 20-second timeout and bounded response size. Temporary failures use exponential backoff from five minutes to six hours and honor Retry-After. HTTP 400/403 pauses the job. Persisted leases and generation fencing prevent overlapping requests or stale responses after a pause/source switch. Durable Object alarms continue when the browser and PC are off and preserve weekly auction alarms.

The deployed paid-plan configuration uses `BACKGROUND_IMPORT_MODE=continuous`: discovery and local index backfill keep running at the gentle rate above. Without that setting, the free-plan guard pauses background work when tracked daily SQL use reaches 2 million rows read or 30,000 rows written, preserves checkpoints, and resumes after midnight UTC. The host console shows the app-local estimate; account-wide and platform operations may use additional allowance. Transactional catalogue counts and indexed housekeeping reduce repeated table scans. Anime collection progress uses an incremental primary-series index and makes no extra Tenrai requests.

## Protected catalogue and ACDB retirement

Player resets and both community reset scopes always retain character/seiyuu catalogues, import checkpoints, bilingual titles, and popularity data. Even `deleteRegistry: true` only removes players/gameplay and resets prices; it cannot delete the catalogue. There is no host operation to clear the Tenrai catalogue.

The retired ACDB snapshot is no longer deployed or used. The one-time protected `replace-acdb` migration removes only ACDB-prefixed inventory, auctions, avatars, overrides and bulk metadata, refunds unclaimed auction holds once without increasing lifetime earnings, and starts Tenrai discovery from page one. Existing seiyuus and unrelated accounts/gameplay survive. Old idempotency receipts remain so retried purchases cannot charge again; retired card results are removed. A host-only `acdb-retirement` preview can be saved privately before migration. Repeated migration requests do not restart progress. ACDB uploads/reactivation are rejected after retirement. The obsolete offline downloader and uploader have been removed; server migration safeguards and their tests remain. Historical source is available in Git history.

## Source rights

[Tenrai's terms](https://tenrai.org/terms) permit collecting, caching, transforming and displaying API responses within applications while preserving third-party rights and access limits. This app does not expose a raw Tenrai database dump or competing API. Portraits remain on MAL CDN URLs; API access does not transfer artwork or portrait rights. No biographies are retained. The older adapted ACDB download is removed from the deployed site; historical attribution remains in Git history. AniList bulk collection is not used.

## Card fusion

Instant selling returns 50% of the weekly shop price for the current rarity, multiplied by the base card's total investment, `2^(level−1)`. A level-4 D sells for 25 × 8 = 200 credits. Extra copies are level 1. Pending uses D pricing. Quotes include rarity, level and price; changes reject the sale for review before any consumption. Credits fit safely up to the wallet limit of one trillion.

Fusion selects up to five physical copies. One invested copy of the highest printed tier sets the baseline and adds no chance. Enhanced cards count as `2^(level−1)` invested copies. Lower-tier contributions halve per tier below the baseline.

| Baseline | Extra same-tier copy | Upgrade cap |
| -------- | -------------------: | ----------: |
| D        |                  35% |         55% |
| C        |                  37% |         57% |
| B        |                  39% |         59% |
| A        |                  41% |         61% |
| S        |                  43% |         63% |
| SS       |                  45% |         65% |
| SSS      |                  47% |         68% |
| Ubers    |                  48% |         70% |

Stay starts at 30%. Raw contribution beyond the upgrade cap transfers one percentage point from stay to downgrade for every four excess points, up to 20 points. Downgrade is the remaining probability. For example, two D copies give 35% upgrade / 30% stay / 35% downgrade; two Ubers give 48% / 30% / 22%. Five D copies give 55% / 10% / 35%. Extra fodder is consumed even beyond the useful cap.

All selected materials are consumed and exactly one random Lv. 1 card is returned. Upgrades independently roll +1/+2/+3 tiers at 90%/9%/1%; downgrades independently roll −1/−2/−3 tiers at 90%/9%/1%. Stay returns the baseline tier. Results clamp to D and AG; a D downgrade therefore still returns D. AG and Pending cannot be materials. Same-type materials retain their type; mixed materials draw from both pools. Every possible nonzero result pool is validated before consumption. Revision-2 quotes are rejected for review.

The Target Card panel browses Success, Great Success, Erig, downgrade and same-tier outcomes with bilingual search and 12 cards per page. A target must belong to the normal +1-tier pool. When that tier rolls, the target gets exactly 50% and the remaining 50% is shared uniformly among other eligible cards. This does not change success or 90/9/1 quality probabilities. When multiple capped outcomes share the target tier (e.g. AG), the target applies to each of them. Same-tier and downgrade results remain uniform. A singleton pool already guarantees its only card and cannot accept a target. Board changes clear ineligible targets; searching or paging preserves a valid target. `GET fusion-outcomes` reads local catalogue metadata only and makes no upstream requests.

Revision-2 expected odds reject outdated clients, changed rarity/level, or stale terms before rolling or consuming. Success rolls use 128 units per basis point to represent fractional cross-tier probabilities exactly. Ownership, protection, escrow validation, synchronous transactions and idempotency prevent duplicate consumption or partial results.
