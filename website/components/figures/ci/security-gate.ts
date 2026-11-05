// At the airport: the pull request rides the belt through GitHub's full checks, then the gate (the merge queue) scans the exact commit again before it boards main.
import { pathOf } from '../ink/ink.ts';
import { desk } from '../ink/sheets.ts';
import { block, plane, stamp, tray } from './airport.ts';

/** A few of the full jobs, by their ci.yml names. */
export const FULL = ['browser', 'boxes-router', 'perf-guards', 'build-warnings'];
export const REQUIRED = ['test', 'typecheck', 'agent-files'];

export function drawing() {
	const k = desk(
		680,
		[
			{ key: 'belt', x: 0, y: 0, w: 21, h: 3, kraft: true, curl: false },
			{ key: 'gate', x: 9.4, y: 5.4, w: 11.4, h: 6.4, bar: 'browser', title: 'merge queue' },
		],
		[
			[9.5, -2.5, 3.2],
			[1, 12, 0],
		],
	);
	k.lay();
	for (let i = 0; i < 30; i++) k.raw.path(pathOf(k.raw.on('belt', [[0.35 + i * 0.7, 0.15], [0.35 + i * 0.7, 2.85]])), 'roller');
	k.next();
	tray(k, 'belt', 0.6, 0.35, 5.4, 2.3, '');
	k.row('belt', 1, 1.4, 'your pull', 'ui');
	k.row('belt', 1, 2.2, 'request', 'ui');
	block(k, 7.6, -0.5, 4, 4, 2.8, 1700, 'GITHUB');
	k.next();
	tray(k, 'belt', 12.4, 0.35, 8.2, 2.3, 'show', 1200);
	FULL.forEach((job, i) => {
		const u = 12.9 + (i % 2) * 4;
		const v = 1.3 + Math.floor(i / 2) * 0.85;
		k.row('belt', u + 0.55, v, job, 'mono small', 'show', 1300 + i * 250);
		k.tick('belt', u + 0.15, v, 'draw', 1350 + i * 250);
	});
	k.row('gate', 0.9, 2.7, 'scans the exact commit', 'mono');
	k.row('gate', 0.9, 3.5, 'it will land, again', 'mono');
	REQUIRED.forEach((job, i) => {
		const u = 1.3 + i * 3.4;
		stamp(k, 'gate', u + 1.1, 4.9, 'PASSED', 3200 + i * 400, 1);
		k.row('gate', u, 6.1, job, 'mono small');
	});
	k.arrow(['belt', 17, 3.1], ['gate', 3, -0.2], 'draw', 2500, -0.6, true);
	plane(k, 1.2, 10.4, 6.6, 1800);
	k.arrow(['gate', 0, 4.5], ['belt', 6.6, 9.8], 'draw', 4600, 0.5, true);
	k.raw.text('belt', 2.4, 13.2, 'MAIN', 'hand desk-text', 'show', 5100);
	return k.build();
}
