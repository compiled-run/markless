// The four setup commands on a terminal sheet, with a pen arrow from pnpm install into the .githooks folder it turns on.
import { desk } from '../ink/sheets.ts';

export const COMMANDS = ['git clone https://github.com/compiled-run/markless.git', 'cd markless', 'corepack enable', 'pnpm install'];
export const PREPARE = 'git config core.hooksPath .githooks';
export const HOOKS = [
	{ name: 'pre-commit', job: 'LINT, THEN CI FAST JOBS' },
	{ name: 'pre-push', job: 'USES gh' },
];

const PITCH = 0.85;
const FIRST = 2.6;

export function drawing() {
	const termH = FIRST + PITCH * 5 + 0.5;
	const k = desk(680, [
		{ key: 'term', x: 0, y: 0, w: 20, h: termH, bar: 'terminal' },
		{ key: 'hooks', x: 4.5, y: termH + 3, w: 13, h: 3.2, folder: '.githooks/' },
	]);
	k.lay();
	COMMANDS.forEach((cmd, i) => {
		k.row('term', 1, FIRST + i * PITCH, '$', 'dim', 'show', 150 + i * 450);
		k.row('term', 1.7, FIRST + i * PITCH, cmd, 'mono', 'show', 150 + i * 450);
	});
	const prepare = FIRST + 4 * PITCH + 0.1;
	k.hand('term', 1.7, prepare, 'PREPARE:', 'show', 1900);
	k.row('term', 4.5, prepare, PREPARE, 'dim', 'show', 2000);
	HOOKS.forEach((hook, i) => {
		k.row('hooks', 0.7, 1.2 + i * 0.95, hook.name, 'mono', 'show', 3000 + i * 300);
		k.hand('hooks', 4.4, 1.2 + i * 0.95, hook.job, 'show', 3100 + i * 300);
	});
	k.next();
	k.swipe('term', 1.7, k.col(1.7, COMMANDS[3]!.length), FIRST + 3 * PITCH, 'show', 1500);
	k.arrow(['term', k.col(4.5, PREPARE.length) + 0.3, prepare - 0.2], ['hooks', 9, -1.5], 'draw', 2300, -0.4, true);
	k.tick('hooks', 12, 1.2, 'draw', 3700);
	return k.build();
}
