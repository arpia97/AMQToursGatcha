# Adjacent AMQ Tours Host Platform

This is an orientation for the separate tour-management project, not permission to deploy it using Gatcha configuration. Local checkout: `../AMQToursHost` relative to the Gatcha repository.

## Purpose and Workflow

Port the Python/Google Sheets host workflow into a persistent website: aliases, player records, ratings and letter ranks, team balancing and requests, private blacklists, masquerade signups, captain drafting, tour brackets, JSON match reports, standings, finalization and stats exports. Raw reports retain `incorrectguessplayers`; keep raw evidence separate from derived statistics.

Host flow: Category → Tour Type → Settings & Signups → Make Teams / Draft → Conclude Tour → Generate Stats. Public Tour Hub, public signups/draft and match reporting stay separate from Host Tools. Do not display a non-live tour as current. Hosts can remove saved drafts at any stage and delete tours after a warning; deletion has no restore UI.

Use canonical AMQ identities shared with Gatcha. Masquerade signups pair the real identity with the masquerade name privately; public signups hide identity and numeric ratings. Draft captains pick through their signed-in player accounts. Captain willingness and team-rearrangement controls apply only to draft tours. Team requests mean keep-together; blacklists are host-private. Teams have four players, no invented team names. Keep saved letter ranks separate from numerical ratings; saved rank wins, recognized pasted rank is a fallback for unassigned players.

Formats include 4v4 with three meetings, 16-player double round robin, 24-player single round robin, and Swiss with five rounds by default, editable. Return meetings are consecutive with the same displayed team order. Swiss pairs the next round after all current matches are reported. Bracket cards use T1 names with expandable rosters; live standings sit below the bracket. Report modals validate one or more JSON files before submitting. Preserve guest reporting validation and duplicate/change checks.

## Source and Deployment

Read that repository's `README.md`, `WORKFLOW.md`, `ARCHITECTURE.md`, `API.md`, `STATS.md`, `IMPORT-REPORT.md` and `PORTING.md`. Inspect its Git diff and implementation; a draft label or old document is not proof of current behavior. The UI is under `public/portal`; the backend uses the existing Sites/Cloudflare scaffold and storage configuration.

Last recorded release, November 9, 2026:

- Source: `303a2142dbbfb04d8fafd09658fc6e1671c373f1`.
- Sites project: `appgprj_6ae47345d3ec8191b1673cfe8079ac7b`, saved version 19.
- Deployment: `appgdep_6af0af0aaae48191ac39a1693d9d23fa`.
- Address: https://amq-tours-host-draft.jonghyuk1997.chatgpt.site/portal/#overview .
- The existing Site audience was still owner-private. Public-facing UI does not imply that global access was opened. Player integration also uses the existing Gatcha `/tours/` bridge.
- Recorded verification: 81 existing tests, build/package checks, local guest/host/mobile UI and authorized read-only live asset verification. No production tour was deleted for testing.

Preserve `.openai/hosting.json`, Site identity, database/bucket bindings, imported history and operational state. Do not run Gatcha's Wrangler deployment against this application. Sites publishing requires its own authorized workflow and credentials; Gemini CLI does not automatically inherit Codex's Sites tools. Local source review/implementation can be handed back to the collaborator with publishing access. Do not copy cached deployment credentials into context or invent an alternative production deployment.
