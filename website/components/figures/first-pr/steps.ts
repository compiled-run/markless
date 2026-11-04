// The six steps of a first pull request as cards on the desk, the branch travelling card to card, then the merge queue's three required checks into main.
import { desk, type SheetSpec } from '../ink/sheets.ts';

export const STEPS = [
	{ title: 'Read the rules', lines: ['AGENTS.md, then your spec'] },
	{ title: 'Write the failing test', lines: ['pnpm exec vp test <file>'] },
	{ title: 'Make the smallest change', lines: ['run the test again'] },
	{ title: 'Run the two checks', lines: ['pnpm run typecheck', 'pnpm ci:local --fast'] },
	{ title: 'Commit, let the hook run', lines: ['pre-commit: lint, fast jobs'] },
	{ title: 'Answer every finding', lines: ['right: fix it', 'stale or wrong: reply'] },
];
export const REQUIRED = ['test', 'typecheck', 'agent-files'];

const W = 10;
const H = 3.4;
const GAP = 0.7;
const TOP = 3.4;
const card = (i: number) => ({ x: (i % 2) * (W + GAP), y: TOP + Math.floor(i / 2) * (H + 1.4) });
const STEP_AT = (i: number) => 500 + i * 700;

export function drawing() {
	const queueY = TOP + 3 * (H + 1.4) + 0.4;
	const specs: SheetSpec[] = [
		{ key: 'branch', x: 3.5, y: 0, w: 13.5, h: 2, curl: false },
		...STEPS.map((_, i): SheetSpec => ({ key: 'c' + i, ...card(i), w: W, h: H, curl: false })),
		{ key: 'queue', x: 0, y: queueY, w: 14.2, h: 3.1, curl: false },
		{ key: 'main', x: 15.2, y: queueY + 0.3, w: 5.5, h: 2.5, kraft: true, curl: false },
	];
	const k = desk(680, specs);
	k.lay();
	k.row('branch', 0.7, 1.3, 'git switch -c fix/counter-text');
	STEPS.forEach((step, i) => {
		const key = 'c' + i;
		k.number(key, 0.8, 1.15, String(i + 1));
		k.row(key, 1.6, 1.15, step.title, 'ui bold-ui');
		step.lines.forEach((line, j) => k.row(key, 1.3, 2.15 + j * 0.8, line, 'mono'));
	});
	k.row('queue', 0.7, 1.1, 'merge queue', 'ui bold-ui');
	REQUIRED.forEach((check, i) => k.row('queue', 0.7 + i * 4.4, 2.3, check, 'mono'));
	k.row('main', 1.4, 1.5, 'main', 'big');
	k.next();
	STEPS.forEach((_, i) => {
		const key = 'c' + i;
		if (i === 1) {
			k.tick(key, 9.1, 2.95, 'flash', STEP_AT(1) + 250, true);
			k.raw.text(key, 6.9, 2.95, 'FAILS', 'hand', 'flash', STEP_AT(1) + 250);
			k.tick(key, 9.1, 2.95, 'draw', STEP_AT(2) + 400);
		} else k.tick(key, 9.1, 2.95, 'draw', STEP_AT(i) + 400);
		if (i === 0) k.arrow(['branch', 6.7, 2.05], ['c0', 5, -0.1], 'draw', 150, 0, true);
		if (i < STEPS.length - 1) {
			const from = card(i);
			const to = card(i + 1);
			if (from.y === to.y) k.arrow([key, W + 0.05, H / 2], ['c' + (i + 1), -0.1, H / 2], 'draw', STEP_AT(i) + 450, 0, true);
			else k.arrow([key, 1.5, H + 0.05], ['c' + (i + 1), W * 0.6, -0.1], 'draw', STEP_AT(i) + 450, 0.2, true);
		}
	});
	const qAt = STEP_AT(STEPS.length) + 200;
	k.arrow(['c5', 5, H + 0.05], ['queue', 10, -0.1], 'draw', qAt - 300, 0, true);
	REQUIRED.forEach((check, i) => k.tick('queue', 0.7 + i * 4.4 + check.length * 0.3 + 0.5, 2.3, 'draw', qAt + i * 350));
	k.arrow(['queue', 14.25, 1.6], ['main', -0.1, 1.25], 'draw', qAt + 1200, 0, true);
	k.swipe('main', 1.3, 4.2, 1.6, 'show', qAt + 1600);
	return k.build();
}
