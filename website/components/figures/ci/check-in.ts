// Checking in at home: ci:local --fast prints a boarding pass with one stamp per fast job, and its stub says the full checks happen at the airport, on GitHub.
import { desk } from '../ink/sheets.ts';
import { pathOf } from '../ink/ink.ts';
import { stamp } from './airport.ts';

/** The fast jobs, as the summary of a fast run on this branch printed them. */
export const FAST = [
	{ job: 'agent-files', took: '0s' },
	{ job: 'typecheck', took: '17s' },
	{ job: 'typecheck-ts7', took: '6s' },
	{ job: 'unit', took: '160s' },
];

export function drawing() {
	const k = desk(680, [
		{ key: 'term', x: 0, y: 0, w: 13, h: 3.6, bar: 'terminal', curl: false },
		{ key: 'pass', x: 0.8, y: 4.6, w: 20, h: 7.4, turn: -0.03 },
	]);
	k.lay();
	k.row('term', 0.9, 2.6, '$', 'dim');
	k.row('term', 1.6, 2.6, 'pnpm ci:local --fast', 'bold');
	k.next();
	k.row('pass', 1, 1.5, 'BOARDING PASS', 'hand', 'show', 300);
	k.row('pass', 1, 2.5, 'checked in at home, from ci.yml', 'mono', 'show', 400);
	for (let i = 0; i < 26; i++) {
		const v0 = 0.3 + i * 0.27;
		k.raw.path(pathOf(k.raw.on('pass', [[15.2, v0], [15.2, v0 + 0.13]])), 'perforation');
	}
	FAST.forEach(({ job, took }, i) => {
		const u = 0.7 + i * 3.6;
		k.box('pass', u, 3.3, u + 3.45, 6.7, '', undefined, 'pen faint');
		k.row('pass', u + 0.15, 4.0, job, 'mono small');
		k.row('pass', u + 0.15, 6.4, took, 'dim small');
		stamp(k, 'pass', u + 1.72, 5.1, 'PASSED', 900 + i * 450);
	});
	k.row('pass', 15.7, 1.5, 'NEXT:', 'hand', 'show', 2800);
	k.row('pass', 15.7, 2.6, 'SECURITY', 'hand', 'show', 2900);
	k.row('pass', 15.7, 3.5, 'ON GITHUB', 'hand', 'show', 3000);
	k.row('pass', 15.7, 5.2, 'browser, boxes,', 'mono small', 'show', 3100);
	k.row('pass', 15.7, 5.9, 'perf-guards, test …', 'mono small', 'show', 3150);
	k.arrow(['term', 8, 3.7], ['pass', 7, 0.1], 'draw', 150, -0.4, true);
	return k.build();
}
