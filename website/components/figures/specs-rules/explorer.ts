// What the repo-files figure prints: a rule you add, a hand edit, and the agent-files job's own error.

/** The rule the reader adds to .ruler/AGENTS.md; pnpm rules copies it into AGENTS.md and CLAUDE.md. */
export const RULE_LINE = '+ Write the test first.';

/** A line typed straight into the generated AGENTS.md. */
export const HAND_LINE = '+ my own rule';

/** What the agent-files job prints when the generated files drift from .ruler/. */
export const CI_ERROR = "Committed agent files are out of sync with .ruler/. Run 'pnpm rules' and commit the result.";
