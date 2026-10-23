# Card database attribution

Character metadata is adapted from [Anime Characters Database's published exports](https://www.animecharactersdatabase.com/databasedumps.php), under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

The adapted database is available in full as [acdb-catalog.json.gz](acdb-catalog.json.gz). The [manifest](acdb-manifest.json) records input URLs and SHA-256 hashes, selection rules, role mapping, coverage and generation time. Reproduce it with `tools/acdb.py` in the public source repository. The adapted database is offered under ODbL 1.0. This download contains catalog data only, without player identities, account credentials or gameplay records.

The snapshot includes characters linked to TV anime, movies, OVA or ONA. It excludes characters linked only to non-anime titles. There is no gender filter. ACDB IDs are retained, so series/age variants may be separate collectibles. Unsorted character roles remain unknown and use the Supporting weight of 100. Main Character and Protagonist use the lower configured Main weight.

The database license does not grant copyright in the linked character artwork or portrait photographs. Those remain with their respective owners. Images are loaded from provider URLs rather than copied into this repository.

The optional 22-card demo/starter catalog uses linked MyAnimeList profiles and portraits. It is independent of the ACDB database. Do not import its character samples over the ACDB pool without resolving duplicate identities. The ACDB published exports do not contain a complete voice-actor portrait catalog.
