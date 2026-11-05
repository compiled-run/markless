// The lines the dev-setup terminal prints, cut from real runs; the test checks each against the repo.

/** What `pnpm install` prints at the end, from the root `prepare` script. */
export const INSTALL = ['. prepare$ git config core.hooksPath .githooks', '. prepare: Done', 'Done in 1.5s using pnpm v10.33.2'];

/** The pre-commit hook's checks, then git's own line, when everything passes. */
export const COMMIT = ['pass: Found no warnings or lint errors', 'ci.yml local run (fast)', '  passed  agent-files', '  passed  typecheck', '  passed  typecheck-ts7', '  passed  unit', '[fix/calendar-week-start 3f9c2e1] Start the calendar week on Monday'];

/** What the hook prints when lint finds an unused import, and the commit stops. */
export const LINT_FAIL = ['pre-commit: vp lint failed (unused imports/vars or lint errors).', 'Fix with: pnpm exec vp lint --fix --fix-suggestions --fix-dangerously'];

/** A commit before `pnpm install`: git has no hooks to run, so nothing is checked. */
export const BARE = ['[fix/calendar-week-start 3f9c2e1] Start the calendar week on Monday'];
