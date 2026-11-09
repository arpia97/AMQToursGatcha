# Collaboration Workflow

## Beginning a Session

1. Read the agent entry point, project context and shared status. Establish the user's current objective; do not assume another agent's chat is available.
2. Run `git status --short`, `git diff --stat`, `git diff` and `git log -5 --oneline`. Fetch remote metadata when available; inspect divergence before pulling. Never overwrite a dirty checkout to get a clean start.
3. Identify the feature modules and existing tests. Record ownership and scope in `STATUS.md` if another agent is working. An empty status file alone does not prove another session is idle.
4. Prefer sequential handoff in the existing checkout. For genuinely simultaneous work, use separate coordinated branches/checkouts and separate local development ports. A different branch name in the same directory does not isolate concurrent edits.

## While Working

- Do not switch branches, stash, reset, clean, force-push or discard someone else's work. Stage explicit owned paths; inspect the staged diff before committing.
- Keep changes focused. Avoid shared formatting sweeps during another agent's feature work. Coordinate edits to `public/app.js`, shared CSS, `src/engine.js`, `src/worker.js` and these handoff files.
- Use local test databases and fixtures for mutations. Live validation should be read-only unless the user's task explicitly authorizes a real production mutation.
- Do not equate an API request failure with a failed mutation: inspect the receipt/result before retrying, especially for grants, refunds, purchases and resets.
- Keep credentials in existing local secret storage/runtime secrets. Do not dump environment files, auth configuration, cookies or entire request headers into model context. Neither this workflow nor `.geminiignore` grants new access.

## Local Setup and Checks

Use Node **22.13 or newer**, Git and pnpm. `package.json` and `pnpm-lock.yaml` are authoritative; preserve the lockfile and avoid unsolicited upgrades.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Wrangler local development uses isolated local state. Check configuration before using any remote flag or binding. A local URL is not proof that all resources are local. Do not import the live economy into a demo or test run.

```sh
node --test tests/<relevant-file>.test.mjs
pnpm check
pnpm test
pnpm build
git diff --check
```

The first line is a template: choose actual existing test files. For small reversible UI changes, focused tests plus browser review may suffice. For wallet, authorization, persistence, schema or shared-engine changes, run the full relevant checks. Documentation-only changes need link/path/factual review and diff checks, not a full gameplay test rerun. Use the existing Node test runner; avoid adding a second framework or redundant tests.

Browser QA should cover the changed interaction at desktop and narrow mobile widths, errors/retries, keyboard/touch behavior where relevant, and whether rendering loses selection, caret position or scroll. Screenshot fixtures must be labelled local/demo. Public/demo build success does not prove a production release.

## Integration and Deployment

One collaborator owns integration and deployment for a task. Review the combined diff, resolve conflicts intentionally, and verify the final integrated commit. Recheck remote HEAD and local work immediately before pushing. A non-fast-forward push requires integration, not a force push.

The repository CI verifies the app and publishes the GitHub Pages **demo**. It does not itself prove deployment of the shared Worker. Check runs must correspond to the actual final SHA.

For an authorized Gatcha deployment, use the existing authenticated Wrangler profile and unchanged production configuration. `pnpm deploy` updates the original game. Deploy `pnpm deploy:short-url` only when the proxy itself needs updating. If credentials are unavailable, finish the reviewable change and hand the exact commit to the deployment owner; do not copy another tool's token/configuration or create a new economy.

After deployment, record the Worker version and verify the actual changed assets/endpoints at the live address. Read-only health/asset checks and authorization rejection checks are preferable to invented production activity. A successful upload alone is not live verification. Roll forward a focused fix rather than restoring an old database.

## Ending a Session

Update `STATUS.md` with the template provided there, including any uncommitted work and the precise next action. Update durable product context when a user decision changes. Keep the runtime source commit separate from newer documentation commits. Report what was tested, pushed, deployed and verified; do not claim another agent has received a message merely because a file was written.
