// ci:local reading ci.yml and printing CI's summary on a terminal sheet: the four fast jobs pass at home, the rest are left to GitHub.
import { desk } from '../ink/sheets.ts';

const PITCH = 0.78;
const FIRST = 2.6;
const v = (row: number) => FIRST + row * PITCH;

/** The summary the fast run printed on this branch, seconds included, with the not-run list cut to five. */
export const SUMMARY = [
	'ci.yml local run (fast)',
	'  passed  agent-files  0s',
	'  passed  typecheck  17s',
	'  passed  typecheck-ts7  6s',
	'  passed  unit  160s',
	'  not run browser  [full]',
	'  not run boxes-router  [full]',
	'  not run perf-guards  [full]',
	'  not run test  [full]',
	'  not run build-warnings  [full]',
];

export const YML = ['jobs:', '  agent-files:', '  typecheck:', '  typecheck-ts7:', '  unit:', '  browser:', '  …'];

export function drawing() {
	const ymlH = v(YML.length - 1) + 0.9;
	const termH = v(SUMMARY.length + 1.4) + 0.3;
	const k = desk(680, [
		{ key: 'yml', x: 9.5, y: 0, w: 11, h: ymlH, bar: 'editor', title: 'ci.yml', curl: false },
		{ key: 'term', x: 0, y: ymlH + 1.6, w: 21, h: termH, bar: 'terminal' },
	]);
	k.lay();
	YML.forEach((text, i) => k.row('yml', 0.9, v(i), text, i === 0 ? 'bold' : 'mono'));
	k.row('term', 1, FIRST, '$', 'dim');
	k.row('term', 1.7, FIRST, 'pnpm ci:local --fast', 'bold');
	k.next();
	k.arrow(['yml', 0.4, v(2)], ['term', 9.5, FIRST - 0.5], 'draw', 200, 1.2, true);
	k.hand('yml', -7.4, v(2.6), 'READS ci.yml EACH RUN', 'show', 700, 'hand desk-text');
	SUMMARY.forEach((text, i) => k.row('term', 1.7, v(i + 1.4), text, i === 0 ? 'bold' : 'mono', 'show', 1200 + Math.min(i, 5) * 500));
	[1, 2, 3, 4].forEach((i) => {
		k.tick('term', 0.95, v(i + 1.4), 'draw', 1500 + (i - 1) * 500);
		k.swipe('term', k.col(1.7, 2), k.col(1.7, 8), v(i + 1.4), 'show', 1500 + (i - 1) * 500);
	});
	k.bracket('term', 13.2, v(6.4), v(10.4), 'draw', 4000);
	k.hand('term', 14, v(8.4), 'ON GITHUB', 'show', 4300);
	k.hand('term', 14, v(2.9), 'THE FOUR FAST JOBS', 'show', 3600);
	return k.build();
}
