# Shared Status and Handoff

Updated November 10, 2026, Asia/Seoul. This file is a coordination record; Git and deployment evidence must still be checked at task start.

## Current Task

- Task: deploy requested main runtime06417ac04c02218dec3e8d287aba63926236a9f7, then include drag-to-order titles.
- Owner/integration/deployment: Codex, main checkout, baseac82521086afeb4a8044f17a3d1074cbef3cd49c (requested runtime is an ancestor;only docs follow it). Fetch/pull --ff-only confirmed up to date.
- Scope: title settings UI/state,shared drag integration,persisted mixed-source title order,reset/identity support,existing tests and handoff. Preserve Gemini song-list/leader-notice/pickem changes.
- Gemini addition (verified in non-overlapping regions of `src/quiz.js`, `public/quiz-ui.js`, `public/features.css`, `tests/quiz.test.mjs`, `tests/quiz-ui.test.mjs`): Quiz leaderboard now returns `me` (`{ id, name, best, bestAt, durationMs, rank }`) for the signed-in viewer, highlights the viewer's row (`tr.is-me`), and appends a highlighted 21st row (`tr.is-me.is-outside-top`) showing placement, score, and time when the viewer is outside the Top 20.
- No production quiz attempts, accounts, credits or inventory mutations for QA.
- Browser QA: mouse pointer drag, keyboard movement, checkbox state, save and reload verified against disposable local fixtures; narrow layout has no horizontal overflow.
- Concurrent uncommitted quiz viewer-row highlighting edits appeared during this task (`public/quiz-ui.js`, leaderboard sections of `src/quiz.js`/`features.css`, related tests/context). These belong to the other collaborator and are excluded from this release. Codex will deploy a clean committed snapshot, preserving those working edits.

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
