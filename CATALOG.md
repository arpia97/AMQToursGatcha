# Catalog sources and bulk seed

## ACDB characters

Use Python 3.10+ and Node 24. The three [published ACDB exports](https://www.animecharactersdatabase.com/databasedumps.php) are downloaded once and cached. Individual character pages and portrait images are not crawled. Downloaded SQL is parsed as literal data and never executed.

```sh
python tools/acdb.py --cache ../../work/acdb --out ../../work/acdb-bundle --public public/data
```

The cache and upload bundle are local intermediate files, outside the public web root. The adapted JSON download and manifest in `public/data/` are public and contain no player data. The database is adapted under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/); retain its attribution and public download. Linked artwork has separate rights.

Only characters linked to TV anime, movies, OVA or ONA are selected. Anime links from the assignments export are considered even when the primary title is not anime. The displayed series prefers the primary anime title, then the lowest anime title ID. There are no sex filters. ACDB IDs and series variants are retained; this importer does not guess cross-series identities. Main Character/Protagonist map to Main; Unsorted is unknown; other assigned roles use Supporting. Unknown uses weight 100. Seiyuus are not classified.

Input SHA-256 hashes, filtering/mapping policy and counts are recorded in `acdb-manifest.json`. Catalog version is derived from the converted records, so unchanged inputs produce the same version. To fetch a newer dump, use a new cache directory. Validate its manifest before uploading.

## Upload and activate

Set `AMQ_HOST_TOKEN` from a private local source, then:

```sh
node tools/seed-acdb.mjs --bundle ../../work/acdb-bundle --url https://YOUR-GAME.workers.dev
```

Alternatively use `--token-file .production.vars` (ignored file with `HOST_TOKEN=...`). Do not pass a token as a command argument. The helper sends up to eight bounded chunks per request, waits between batches, retries temporary errors, and saves acknowledged chunks in the local bundle. Run the same command to resume. Do not reuse a checkpoint after deleting/recreating the database; remove that specific local checkpoint first.

Uploads remain staged until activation checks card/pool/browse counts, chunk continuity, unique IDs and role consistency. Activation changes the active snapshot in a transaction. Pack draws and auctions use indexed chunks rather than loading every card. Public browsing is paginated at 40 cards. Host role changes override the corresponding source record without making it a second collectible.

Import only the seiyuu records from `public/sample-catalog.json` if using ACDB characters. The host starter button does this automatically when an ACDB snapshot is active. The 10 sample seiyuus are a small initial pool, not complete coverage.

The original AniList bulk helper was removed because AniList prohibits mass collection/storage. Lowering request frequency does not change that restriction.

## Kitsu seiyuu source

The public JSON:API responds at `/api/edge/people/{id}` with `data.attributes.name` and `data.attributes.image.original`. The people collection includes non-voice production staff. Use `/api/edge/character-voices?include=person,mediaCharacter` to identify credited voice actors and inspect `attributes.locale` (`ja_jp` for Japanese credits), then deduplicate by the related person ID. An actor's card has no Main/Supporting classification, regardless of the character role attached to the credit.

The endpoint was verified with Yui Ishikawa (person 6487). A Kitsu-wide import is not active. Any future importer should use one request at a time, saved pagination progress, a conservative delay, Retry-After/backoff, and stable IDs. Missing portraits and cross-provider actor matches need explicit handling. API availability is not a blanket license for portrait photographs.

## Tenrai seiyuu import (Jikan-compatible)

Tenrai implements Jikan-compatible `people/{id}` and `people/{id}/full` endpoints that provide person profiles and portrait URLs. The people collection also includes producers, animators and other staff; person voice-credit entries do not carry a language field. This importer therefore reads the documented `anime/{id}/characters` response, where each `voice_actors` entry includes `person` and `language`. Only Japanese credits with a usable portrait enter the pool. Character Main/Supporting roles never classify or weight the actor.

Anime titles are visited in ascending MAL ID order through paginated `/anime` searches. There is one API request at a time with at least ten seconds between successful requests. Tenrai documents 4 requests/second and 120/minute; this job targets six/minute. Errors use exponential backoff from five minutes to six hours and respect Retry-After. HTTP 400/403 pauses rather than bypassing an upstream refusal. The current queue/page, lease and counters are saved in SQLite before/after each request, with generation fencing for pause/reset races.

Actor IDs are `mal-person-{id}`, matching the starter catalog. Repeated credits do not create duplicate collectibles, and the discovery pass does not overwrite existing metadata. Missing portraits are skipped. The scan is finite and reports completed only after reaching the final page and processing its title queue; coverage depends on Tenrai/MAL's available cast credits. Run and inspect it from the host console's Catalog & prices tab.

Jikan’s maintainer [announced the public service was discontinued on October 1, 2026](https://github.com/jikan-me/jikan-rest/issues/613). Repeated timeouts/522s from that host are not treated as a recoverable source. Tenrai is a maintainer-listed replacement; it was verified against people details, paginated anime search, and anime voice credits before switching. [Tenrai documentation](https://api.tenrai.org/llms.txt) describes the compatibility and public limits. Its [terms](https://tenrai.org/terms) permit storing/caching responses in applications while preserving third-party rights. The compatibility modules and `jikan-*` host endpoint names remain for existing tools. A provider change retains the checkpoint and actor IDs, but clears the retired provider’s failure backoff. API access does not license linked portrait photographs. Portraits stay on provider URLs; no images or biographies are copied into this repository.
