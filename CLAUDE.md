# Arcade — Claude Code Guidance

@AGENTS.md

The imported `AGENTS.md` is the authoritative always-on project guidance. The
notes below only map its Codex-specific references onto Claude Code.

## Claude Code Mapping

- Project skills live under `.claude/skills/` (mirrored from `.codex/skills/`).
  Where `AGENTS.md` says `$arcade-implementation` or `$arcade-spec-maintenance`,
  use the Skill tool: `arcade-implementation` for implementation work,
  `arcade-spec-maintenance` for spec edits, and `review-with-engineer-lenses`
  for reviewing API/docs/DX changes.
- Where skills say `apply_patch`, use the Edit/Write tools.
- The `.codex/rules/*.rules` command policies are ported to
  `.claude/settings.json` permissions: standalone esbuild/terser/Rollup/SWC/
  webpack/Babel commands are denied (Rolldown/Vite only), and dependency
  add/install/update commands prompt for review (build tooling stays
  Rolldown/Vite; core packages stay runtime-agnostic — prefer `pathe`/`ufo`
  and host adapters).
- GoalBuddy flows referenced in `AGENTS.md` map to the `goalbuddy` skill and
  `/goal` in Claude Code.
