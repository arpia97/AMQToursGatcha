# Reviewed Economy Repair

The owner-only maintenance endpoints support the authorized October 30, 2026 reward rollback. Ordinary hosts cannot use them. They accept a reviewed row manifest, never arbitrary SQL; credentials, account identities, aliases, catalogue tables and import checkpoints are outside the patch allowlist.

- `POST /api/host/economy-repair-preview` verifies the manifest digest, cutoff, per-player ledger and economic receipt guards, and every original row before returning counts. It makes no economic changes.
- `POST /api/host/economy-repair` requires the repair ID as its idempotency key. The entire patch, compensating wallet ledger entries, repair journal and request receipt commit in one synchronous transaction. A pre-commit Durable Object bookmark is retained for emergency recovery; applying a repair never performs a database-wide restore.
- `GET /api/host/economy-repair-receipt?id=…` reads a completed result. If a request times out, read this receipt before considering any retry. An exact retry returns the saved result; a changed manifest with the same key is rejected.

The specific reviewed scope begins October 30 at 16:33:37.731 KST and excludes unrelated rewards after 21:00 KST. Reconstruction uses recorded outcomes and legitimate credits first. Unaffordable acquisitions and their dependent sales, fusion or enhancement are reversed. A gambling round is reversed as a whole when a paid action could not be funded, returning its fees and removing its payout. Reversed financial rounds remain in storage with an `-reverted` game suffix and are excluded from gambling rankings. Original ledger entries and request receipts remain available, alongside compensating entries and the repair journal.

Production manifests, snapshots and per-player results are private operational artifacts outside this repository. Never rerun a completed reset or reconstruct an uncertain repair using a new ID. Refresh a stale snapshot and rerun the local reconciliation before applying an unapplied plan. The repair allowlist explicitly excludes revel, whose separately authorized reset was already completed.
