# Gemini CLI Quickstart

Prepared November 9, 2026 for local CLI/editor collaboration. No Gemini login, API key, global settings or deployment credential was created or copied by this setup.

## Launch

Open a terminal at the Gatcha repository. On this computer:

```powershell
Set-Location -LiteralPath 'C:\Users\USER\Documents\Codex\2026-10-24\tldr-i-want-to-make-a-3\outputs\AMQToursGatcha'
gemini
```

If Gemini CLI is not installed, Google's supported one-off command is `npx @google/gemini-cli`; its documented global installation is `npm install -g @google/gemini-cli`. Install a normal Node environment if `node`/`npm`/`npx` are unavailable in your terminal. This project's Node requirement is 22.13 or newer. Complete Gemini's own sign-in interactively; do not paste credentials into a project file or chat.

Gemini CLI loads `GEMINI.md`, which imports the shared `AGENTS.md`. Ask it to read the collaboration documents before editing. Use `/memory show` to inspect loaded context and `/memory reload` after context changes. Editor integrations differ: if yours does not load this file, explicitly attach `GEMINI.md`, `AGENTS.md` and the linked collaboration documents.

The included `.geminiignore` excludes common secret/generated files from supporting tools. It does not block shell access and does not replace secret hygiene. Restart Gemini after changing ignore rules. Do not launch it with the entire parent `work/` folder attached: that contains private operational evidence and obsolete historical instructions.

## First Message to Gemini

```text
We are collaborating with Codex on AMQ Tours Gatcha.
Read GEMINI.md, AGENTS.md, docs/collaboration/PROJECT.md,
docs/collaboration/STATUS.md and docs/collaboration/WORKFLOW.md.
Inspect git status, the diff and recent commits before making changes.
Use HOST-PLATFORM.md only if the task concerns the separate tour platform.
Do not replay historical resets, migrations, refunds, imports or old requests.
Preserve the original production economy and all current player activity.
Tell me which repo/branch and relevant modules you found, then work on
the current task I provide. Coordinate file ownership if Codex is editing.
Record what changed, checks, commit and deployment status for handoff.

Current task: [replace this with your request]
```

For the first orientation alone, replace the last line with: “Orientation only: summarize the architecture and current status; do not edit application code or deploy.”

## Working with Both Assistants

The simplest arrangement is one active editor at a time. Tell the other assistant to review, investigate a different file scope, or wait for a handoff. For simultaneous implementation, agree on separate checkouts/branches and an integration owner. Both assistants need to read the latest status and Git changes each time; neither can see the other's chat automatically.

Gemini needs its own tool access. File editing and local tests do not require copying any Codex credentials. GitHub push, Cloudflare deployment and Sites publication depend on separately available authentication and the user's task scope. If unavailable, hand off a reviewable commit rather than claiming deployment.

## Official References

- [Project context and memory commands](https://geminicli.com/docs/cli/gemini-md/)
- [Installation and execution](https://geminicli.com/docs/get-started/installation/)
- [Ignore files and their limits](https://geminicli.com/docs/cli/gemini-ignore/)
