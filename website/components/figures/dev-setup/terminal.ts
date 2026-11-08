// A contributor's first hour, step by step: what the terminal prints at each step (real output, abridged with …) and what the file panel shows.

export const BRANCH = 'fix/semantic-graph-test';
export const FILE = 'packages/compiler/test/semantic-graph.test.ts';

/** The prepare line pnpm prints for the root package's `prepare` script, and its closing line. */
export const PREPARE = '. prepare$ git config core.hooksPath .githooks';
export const PNPM_DONE = 'Done in … using pnpm v10.33.2';
/** The lint warning for the slip, from a real run of `vp lint --deny-warnings` on this file with the import added at line 2. */
export const LINT_WARNING = FILE + ":2:10: warning eslint(no-unused-vars): Identifier 'readFileSync' is imported but never used.";
/** The pre-commit hook's own lines when lint fails. */
export const LINT_FAIL = ['pre-commit: vp lint failed (unused imports/vars or lint errors).', 'Fix with: pnpm exec vp lint --fix --fix-suggestions --fix-dangerously'];
/** The fast jobs the hook runs, in the order ci:local prints them. */
export const FAST = ['agent-files', 'typecheck', 'typecheck-ts7', 'unit'];

/** One step: its caption, the command typed, and the lines printed. `kind` colours a line: ok, bad or dim. */
export interface Step {
	readonly caption: string;
	readonly lines: readonly { readonly text: string; readonly kind: '' | 'cmd' | 'ok' | 'bad' | 'dim' }[];
}

const cmd = (text: string) => ({ text: '$ ' + text, kind: 'cmd' as const });
const out = (text: string, kind: '' | 'ok' | 'bad' | 'dim' = '') => ({ text, kind });

export const STEPS: readonly Step[] = [
	{ caption: 'Clone the repo and step into it.', lines: [cmd('git clone https://github.com/compiled-run/markless.git'), out("Cloning into 'markless'...", 'dim'), cmd('cd markless')] },
	{ caption: 'One install sets up every package and turns on the git hooks.', lines: [cmd('corepack enable'), cmd('pnpm install'), out('…', 'dim'), out(PREPARE, 'ok'), out(PNPM_DONE, 'dim')] },
	{ caption: 'Run one test file. It is the quickest way to know your setup works.', lines: [cmd('pnpm exec vp test packages/compiler/test/semantic-graph.test.ts'), out(' Test Files  1 passed (1)', 'ok'), out('      Tests  26 passed (26)', 'ok')] },
	{ caption: 'Make your change on your own branch.', lines: [cmd('git switch -c ' + BRANCH)] },
	{ caption: 'git commit runs the hook first. Lint finds an unused import, so the commit stops.', lines: [cmd('git commit -am "Cover the empty graph"'), out(LINT_WARNING, 'bad'), out(LINT_FAIL[0]!, 'bad'), out(LINT_FAIL[1]!, 'dim')] },
	{ caption: 'Remove it and commit again. Lint and CI’s four fast jobs pass.', lines: [cmd('git commit -am "Cover the empty graph"'), out('pass: Found no warnings or lint errors in … files', 'ok'), ...FAST.map((job) => out('  passed  ' + job, 'ok')), out('[' + BRANCH + ' …] Cover the empty graph', 'dim')] },
	{ caption: 'Push your branch, then open the pull request.', lines: [cmd('git push -u origin ' + BRANCH), out("remote: Create a pull request for '" + BRANCH + "' on GitHub by visiting:", 'dim'), out('remote:      https://github.com/compiled-run/markless/pull/new/' + BRANCH, 'dim')] },
];

/** Every printed line, flat and keyed, tagged with the step that prints it. */
export const LINES = STEPS.flatMap((step, s) => step.lines.map((line, i) => ({ ...line, key: s * 100 + i, step: s })));

/** The stepper rail's rows. */
export const RAIL = STEPS.map((step, key) => ({ key, caption: step.caption, n: String(key + 1) }));

/** The file panel: the test file's real first lines, the slip added at step 4, and the new test. */
export const PANEL = [
	{ key: 0, text: "import { expect, test } from 'vitest';", kind: '' },
	{ key: 1, text: "import { readFileSync } from 'node:fs';", kind: 'slip' },
	{ key: 2, text: 'import {', kind: '' },
	{ key: 3, text: '\tbuildSemanticGraph,', kind: '' },
	{ key: 4, text: '…', kind: 'dim' },
	{ key: 5, text: "test('an empty file has no state', () => {", kind: 'added' },
	{ key: 6, text: '\t…', kind: 'added' },
	{ key: 7, text: '});', kind: 'added' },
];
