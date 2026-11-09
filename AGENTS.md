# Working on AMQ Tours Gatcha

These instructions apply to Codex, Gemini, and other coding collaborators in this repository. Current explicit user instructions take precedence over these project defaults.

## Start Each Task

- Read `docs/collaboration/PROJECT.md`, `docs/collaboration/STATUS.md`, and `docs/collaboration/WORKFLOW.md`.
- Inspect `git status --short`, `git diff`, and recent commits before editing. Preserve work already present. Read any more specific instructions under the directories being changed.
- Confirm which application is involved: this repository is Gatcha; the adjacent AMQToursHost is a separate application and deployment.
- Record task ownership and the intended files in the shared status before concurrent work. Do not edit the same files or deploy concurrently without coordination.

## Preserve Production

- Keep the original Worker `amqtours-gatcha`, Durable Object binding `GAME`, class `Game`, and named instance `amqtours-economy-v1`. The `play` Worker is only a service-binding proxy.
- Preserve wallets, accounts, aliases, cards, holds, receipts, catalogue, imports and existing activity. Never replay historical resets, reversals, card imports, compensation or enhancement migrations.
- Test mutations using disposable local state. Do not create production test accounts or place production bets, trades, votes, quiz attempts, grants or refinements.
- Keep secrets, tokens, cookies, private exports and player audit evidence out of prompts, context documents, logs and Git. Ignore files are a convenience, not a security boundary.
- Wallet, reward and inventory mutations remain server-authoritative, transactional and retry-safe. Preserve authorization and idempotency checks.

## Implementation and Handoff

- Follow the existing vanilla JavaScript ES module structure. Avoid an unsolicited framework rewrite or dependency upgrades.
- Keep the compact dark UI, book-style title case, existing rarity/level effects, and proper spelling of names. Do not add gender filtering. Rankings remains the last main tab.
- Use focused existing tests for small fixes; run full checks for economy, authorization, schema or shared-engine changes. Prefer meaningful behavioral coverage over redundant implementation tests.
- After a task, update the shared status with commits, checks, deployment evidence and any remaining work. Distinguish locally verified, pushed, deployed and live-verified work.
