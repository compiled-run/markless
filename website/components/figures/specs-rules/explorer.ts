// What the specs-and-rules step-through shows: one real spec, one real pull request that changed code and its spec together, and the files pnpm rules writes from .ruler/.

/** The spec drawer's files, and the one the reader opens, with its real first lines. */
export const SPECS = ['framework-design.md', 'framework/03-state-graph.md', 'framework/07-diagnostics.md', 'router/'];
export const OPENED = { path: 'specs/framework/03-state-graph.md', title: '# State Graph', line: 'Author-facing graph state semantics, async derivation, shared state, …' };

/** A real pull request that changed behaviour and its spec in one go (#490). */
export const SAME_PR = { number: '#490', code: 'packages/web/src/fns/shared-start.ts', spec: 'specs/framework/03-state-graph.md' };

/** The source, the command, and the files it writes, each stamped with the source line Ruler writes into it. */
export const SOURCE = '.ruler/AGENTS.md';
export const COMMAND = 'pnpm rules';
export const OUTPUTS = ['AGENTS.md', 'CLAUDE.md'];
export const STAMP = '<!-- Source: .ruler/AGENTS.md -->';

/** One caption per step. */
export const STEPS = [
	'specs/ says how Markless behaves. Open one to read it.',
	'Change behaviour, and change its spec in the same pull request.',
	'.ruler/ is the one source. pnpm rules writes AGENTS.md and CLAUDE.md from it.',
	'Write on a generated file, and the agent-files check goes red. Edit .ruler/ and run pnpm rules instead.',
];

export const RAIL = STEPS.map((caption, key) => ({ key, caption, n: String(key + 1) }));
