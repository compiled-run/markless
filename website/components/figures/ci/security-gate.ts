// At the airport: the pull request's tray comes out of GitHub's X-ray tunnel while the operator's screen ticks the full jobs, the gate's departure board lists the merge queue's checks, and the plane lifts off the runway toward main.
import { matrixOf } from '../ink/desk.ts';
import { hatch, line, outline, pathOf } from '../ink/ink.ts';
import { desk, type Point3 } from '../ink/sheets.ts';
import { block, plane, upright } from './airport.ts';

/** A few of the full jobs, by their ci.yml names. */
export const FULL = ['browser', 'boxes-router', 'perf-guards', 'build-warnings'];
export const REQUIRED = ['test', 'typecheck', 'agent-files'];

const BED = { x: 0, y: -7, w: 4.2, d: 13, h: 0.9 };

export function drawing() {
	const k = desk(
		680,
		[{ key: 'runway', x: 9.2, y: 4.6, w: 15.5, h: 2.4, turn: -0.22, kraft: true, curl: false }],
		[
			[-0.8, -8.5, 0],
			[-0.8, 7, 0],
			[24.5, -6, 5],
			[24.5, 7.5, 0],
			[5, -7, 4.6],
		],
		{ elevation: 38 },
	);
	k.lay();
	const P = k.raw.projAll;
	const run = (u0: number, u1: number) => k.raw.on('runway', [[u0, 1.3], [u1, 1.3]]);
	for (let u = 0.6; u < 15; u += 1.3) k.raw.path(line(run(u, u + 0.6), { w: 1, seed: 1900 + Math.round(u * 10), over: 0 }), 'sheet-ink');
	k.next();

	block(k, BED.x, BED.y, BED.w, BED.d, BED.h, 1910);
	const top = (x: number, y: number): Point3 => [x, y, BED.h + 0.01];
	for (let y = BED.y + 0.4; y < BED.y + BED.d; y += 0.55) k.raw.path(line(P([top(0.25, y), top(BED.w - 0.25, y)]), { w: 0.5, seed: 1920 + Math.round(y * 10), over: 0 }), 'roller');
	k.raw.path(line(P([top(0.12, BED.y), top(0.12, BED.y + BED.d)]), { w: 0.8, seed: 1930 }) + line(P([top(BED.w - 0.12, BED.y), top(BED.w - 0.12, BED.y + BED.d)]), { w: 0.8, seed: 1931 }), 'sheet-ink');

	const T = { x: -0.7, y: -4.6, w: 5.6, d: 3.4, h: 4.4 };
	block(k, T.x, T.y, T.w, T.d, T.h, 1940, 'GITHUB');
	const fy = T.y + T.d + 0.01;
	const ax = T.x + T.w / 2;
	const ar = 2.1;
	const arch: Point3[] = [[ax - ar, fy, BED.h]];
	for (let i = 0; i <= 20; i++) {
		const a = Math.PI - (i / 20) * Math.PI;
		arch.push([ax + Math.cos(a) * ar, fy, BED.h + 1.5 + Math.sin(a) * 1.4]);
	}
	arch.push([ax + ar, fy, BED.h]);
	const hole = P(arch);
	k.raw.path(pathOf(hole, true), 'tunnel-dark');
	k.raw.path(hatch(hole, 0.15, 1.1, 1950, { cluster: 6, skip: 0.05 }) + hatch(hole, 1.3, 1.6, 1951, { cluster: 4, skip: 0.2 }), 'sheet-hatch');
	for (let i = 0; i < 9; i++) {
		const x = ax - ar + 0.25 + i * 0.46;
		k.raw.path(line(P([[x, fy + 0.02, BED.h + 2.6 - Math.abs(i - 4) * 0.12], [x, fy + 0.02, BED.h + 1.1]]), { w: 0.6, seed: 1960 + i, over: 0 }), 'sheet-ink');
	}
	k.raw.path(outline(hole, { w: 1.2, heavy: 1, seed: 1970 }), 'sheet-ink');

	const tray = (y0: number, m: 'show' | 'gone', at: number) => {
		const rim = P([top(0.5, y0), top(BED.w - 0.5, y0), top(BED.w - 0.5, y0 + 2.6), top(0.5, y0 + 2.6)].map((p) => [p[0], p[1], p[2] + 0.25] as Point3));
		const st = k.raw.motion(m, at);
		k.raw.path(pathOf(rim, true), 'sheet-paper ' + m, st);
		k.raw.path(hatch(rim, 1.2, 2.4, 1980 + Math.round(y0), { cluster: 3, skip: 0.4, trim: 0.4 }), 'sheet-hatch light ' + m, st);
		k.raw.path(outline(rim, { w: 1.2, heavy: 1, seed: 1985 + Math.round(y0) }), 'sheet-ink ' + m, st);
		const o: Point3 = [0.9, y0 + 1.6, BED.h + 0.3];
		k.raw.textWith(matrixOf(k.raw.proj(o), k.raw.proj([o[0] + 0.05, o[1], o[2]]), k.raw.proj([o[0], o[1] + 0.05, o[2]])), 'your PR', 'ui bold-ui', m, at);
	};
	tray(BED.y + 0.6, 'gone', 300);
	tray(T.y + T.d + 0.7, 'show', 1500);

	const screen = upright(k, 6.2, -3.4, 4.8, 3.4, 1.4, 1990);
	FULL.forEach((job, i) => {
		const at = 900 + i * 300;
		screen.text(0.9, 0.75 + i * 0.75, job, 'mono small', at);
		screen.tick(0.4, 0.75 + i * 0.75, at + 100);
	});

	const board = upright(k, 13.6, -4.6, 9.6, 4.8, 0.2, 2010);
	board.text(0.6, 0.95, 'DEPARTURES', 'hand');
	board.text(5.2, 0.95, 'merge queue', 'mono small');
	REQUIRED.forEach((job, i) => {
		const at = 2600 + i * 400;
		board.text(0.6, 2 + i * 0.9, job, 'mono');
		board.text(5.6, 2 + i * 0.9, 'BOARDED', 'hand', at + 150);
		board.tick(5.2, 2 + i * 0.9, at + 150);
	});

	plane(k, 10.2, 5.6, 4.6, 2050, 0, 'gone', 3800);
	plane(k, 18.6, 2.4, 4.6, 2060, 3.2, 'show', 4100);
	const end = k.raw.on('runway', [[13.4, -0.4]])[0]!;
	k.raw.textWith(matrixOf(end, [end[0] + 1, end[1]], [end[0], end[1] + 1]), 'MAIN', 'hand desk-text', 'show', 4400);
	k.raw.path(pathOf(P([[14.8, 5.4, 0.7], [16.8, 4.3, 1.8], [18.6, 2.6, 3.4]])), 'pen dash show', k.raw.motion('show', 4100));
	return k.build();
}
