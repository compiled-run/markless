// The typecheck job's steps from ci.yml, each sorted by ci:local: uses steps skipped, the install kept for --install, the checks run.
import { desk } from '../ink/sheets.ts';

const PITCH = 0.8;
const FIRST = 2.6;
const v = (row: number) => FIRST + row * PITCH;

/** The typecheck job's steps in ci.yml, cut to their `uses:` or `run:` line. */
export const STEPS: { text: string; group: 'skip' | 'setup' | 'check' | '' }[] = [
	{ text: 'typecheck:', group: '' },
	{ text: '  steps:', group: '' },
	{ text: '    - uses: actions/checkout@v4', group: 'skip' },
	{ text: '    - uses: pnpm/action-setup@v4', group: 'skip' },
	{ text: '    - uses: actions/setup-node@v4', group: 'skip' },
	{ text: '    - run: pnpm install --frozen-lockfile', group: 'setup' },
	{ text: '    - run: node scripts/ci/check-workflow.mjs …', group: 'check' },
	{ text: '    - run: pnpm typecheck', group: 'check' },
	{ text: '    - run: pnpm exec vp check --no-fmt', group: 'check' },
];

export const LABELS = { skip: 'SKIP', setup: 'SETUP', check: 'CHECK' };

export function drawing() {
	const k = desk(680, [{ key: 'yml', x: 0, y: 0, w: 21, h: v(STEPS.length - 1) + 1.6, bar: 'editor', title: 'ci.yml' }]);
	k.lay();
	const u = 1.1;
	STEPS.forEach((step, i) => k.row('yml', u, v(i), step.text, step.group === '' ? 'bold' : 'mono'));
	k.next();
	let at = 400;
	STEPS.forEach((step, i) => {
		if (!step.group) return;
		const end = k.col(u, step.text.length);
		if (step.group === 'skip') k.strike('yml', k.col(u, 6), end, v(i) - 0.05, 'draw', at);
		if (step.group === 'setup') k.ring('yml', k.col(u, 6), end, v(i), 'draw', at, 0.46);
		if (step.group === 'check') k.tick('yml', 16.6, v(i), 'draw', at);
		k.hand('yml', 17.4, v(i), LABELS[step.group], 'show', at + 150);
		at += 500;
	});
	return k.build();
}
