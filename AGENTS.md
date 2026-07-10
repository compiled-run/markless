# Agent Guidance

The task packet or active goal card defines scope. Stay inside its named files and preserve unrelated work.
If a required decision is missing from the packet, return blocked; do not improvise.
Crew and GoalBuddy artifact-writing packets/cards must declare `Workflow guidance: <one or more docs/agent-workflows/*.md paths>`.
If that declaration is missing, or says `Workflow guidance: none` for a write task, stop before editing and return blocked.
Read-only scout/critique packets may declare `Workflow guidance: none`.
For direct interactive user requests, pick the file(s) in `docs/agent-workflows/` matching the task type.
The progress ledger is CLI-managed: use `pnpm state append|status|tail|project`.
Never read `specs/state-archive.md` or bulk history; use the CLI.
`docs/agent-workflows/` is the home for workflow guidance.
