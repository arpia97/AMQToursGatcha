# Shared Status and Handoff

Updated November 10, 2026, Asia/Seoul. This file is a coordination record; Git and deployment evidence must still be checked at task start.

## Current Task

Completed: pull/deploy requested main runtime06417ac04c02218dec3e8d287aba63926236a9f7 and add drag-to-order titles. Requested runtime was already an ancestor of ac82521; only handoff docs followed it. Runtime source commit **f4482ad9daacac132976cc7a372d768d8994c5c3**, pushed to main.

- Original Worker **17f19215-de64-4ed4-a940-e5eea39ecf83**, deployed from a clean Git archive of the exact runtime commit. Same GAME/Game/amqtours-economy-v1, configuration and import state; no live resets, grants, votes, refinements or title saves.
- My Profile → My Titles: mouse/touch drag handles, keyboard arrows/Home/End, Reset Changes and Save. Host is fixed above earned titles. Mixed quiz/card order persists independently of visibility; duplicate card awards remain distinct. Ownership, exact earned set and stale-order validation precede writes; old visibility-only clients preserve order. New awards append. The additive order table follows canonical identity migration and existing gameplay reset behavior; no reset was executed.
- Included requested06417ac behavior: Song List pop-up/metadata endpoint, displaced quiz #1 notice, and participated-only pick'em tag.
- Clean release: **431 Node tests**, **207 syntax checks**, Wrangler dry-run and diff checks passed. Exact runtime-source application CI and demo CI both passed.
- Browser disposable local fixtures: actual pointer drag, keyboard movement, hidden-selection preservation, saving/reload, duplicate awards, Host pinned, narrow layout without horizontal overflow. Local screenshot: outputs/AMQTours-title-order-preview.png in surrounding workspace.
- Live: eight changed assets200 and exact release bytes; health200; guest My Titles401. After default deferred code adoption, published quiz-songs200 with27 metadata-only entries/no raw audio. Existing signed-in browser My Titles showed enabled Save,2 handles and no rollout notice; read-only verification only. Live screenshot: outputs/AMQTours-title-order-live.png.
- Evidence: work/TITLE-ORDER.md, title-order-live-assets.json, title-order-runtime-proof.json, title-order-ci.json and clean release test/deploy logs in the surrounding workspace. No further title-order task remains.

## Concurrent Working Edits — Not Deployed

Uncommitted quiz viewer-row highlighting edits appeared during Codex's title task. Preserved untouched and excluded from this deployment: public/quiz-ui.js; leaderboard sections of src/quiz.js and public/features.css; tests/quiz-ui.test.mjs and tests/quiz.test.mjs; docs/collaboration/PROJECT.md. Their working-tree presence does **not** indicate production release. Other collaborator must inspect/test/commit them separately. Codex owns no further feature or deployment task.

## Last Verified Application Release

- Original Worker version: `0a17cc58-d630-4b11-a2aa-14cc80b739a3`.
- Live: https://play.amqtours-gatcha.workers.dev/ .
- Quiz moves and saved-run recovery bypass starter scans, market maintenance and alarm scheduling. Responses reuse validated run data after persistence, preserving authoritative timing/scoring/rewards and durable receipts. No schema/binding changes.
- Local Workers comparison: answer15→8SQL calls;market2→0,schedule1→0,starter1→0. This measures work per request, not a guaranteed network-latency improvement.
- Client pauses audio on lock, uses12-second request deadlines and stable keys for unchanged retries, and checks the saved answer after ambiguous failures. It reveals only server-confirmed results. Completion metadata refresh no longer blocks the result screen.
- Checks:427Node tests,206syntax checks,final dry-run and diff checks passed. Exact runtime-source application and demo CI passed. Only one new cohesive frontend regression;existing Workers integration test extended.
- Browser: disposable local fixture delayed a committed response14seconds;the saved correct answer was recovered and the next normal answer succeeded. Lost/unsaved response retries and completion-read failures also covered. Local screenshot outputs/AMQTours-quiz-submission-recovery.png in the surrounding workspace.
- Live:app.js/quiz-ui.js200and exact release bytes;health200;anonymous quiz-run401with new fast-path rejection. Existing data preserved through the default deferred update.
- Natural traffic after adoption:71successful new-version Durable Object answer log events in a2-minute window;mean136ms,p95340ms,max508ms,meanCPU2.21ms. Short workload-dependent sample;not unique-answer counts or a controlled latency guarantee. No production quiz submitted by QA.
- Local evidence:work/QUIZ-ANSWER-LATENCY.md,work/quiz-latency-proof.json. Later documentation commits do not change the runtime source/version above.

## Work Ownership

No concurrent feature task is claimed. Before overlapping work, record each task's agent, branch/check-out path, base SHA, file scope, integration owner and deployment owner. Agree on ownership before editing shared files. A status row is advisory, not an atomic lock.

## Next Handoff Template

Copy and replace this section when work changes:

```text
Task / user request:
Agent / branch / checkout path:
Base SHA / changed files:
Other collaborator's work to preserve:
Completed behavior / decisions:
Checks run and results:
Commit / push / CI status:
Runtime deployment version / live verification (or not deployed):
Data operations performed / idempotency evidence (or none):
Remaining work / blocker / exact next action:
Integration owner / deployment owner:
```

Keep private player evidence, tokens and credentials in appropriately protected local records, never in this tracked file.
