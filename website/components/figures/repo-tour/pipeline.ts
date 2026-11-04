// A .tsrx file passing through the compile-time package folders, then the render folders, and out to the places a page runs.
import { desk, type SheetSpec } from '../ink/sheets.ts';

/** The packages on the desk, with the job each does, as the page states it. */
export const COMPILE = [
	{ key: 'compiler', path: 'packages/compiler', job: 'READS .TSRX, PLANS IT' },
	{ key: 'bundler', path: 'packages/bundler', job: 'RUNS IT IN VITE OR ROLLDOWN' },
];
export const RENDER = [
	{ key: 'web', path: 'packages/web', job: 'RENDERS, RESUMES' },
	{ key: 'runtime', path: 'packages/runtime', job: 'THE STATE GRAPH' },
	{ key: 'serializer', path: 'packages/serializer', job: 'PAYLOAD TYPES' },
];
export const PLACES = ['a browser', 'a server', 'a build step', 'a test'];

const Y = { file: 0, compile: 5.4, render: 11, places: 16.6 };

export function drawing() {
	const specs: SheetSpec[] = [
		{ key: 'file', x: 6.5, y: Y.file, w: 8, h: 3.1, bar: 'editor', title: 'Counter.tsrx', curl: false },
		...COMPILE.map((p, i): SheetSpec => ({ key: p.key, x: i * 11.4, y: Y.compile, w: 9.6, h: 3, folder: p.key })),
		...RENDER.map((p, i): SheetSpec => ({ key: p.key, x: i * 7.2, y: Y.render, w: 6.6, h: 3, folder: p.key })),
		...PLACES.map((_, i): SheetSpec => ({ key: 'place' + i, x: i * 5.4, y: Y.places, w: 4.9, h: 2.2, curl: false })),
	];
	const k = desk(680, specs);
	k.lay();
	k.print('file', 1, 2.6, [{ t: 'let', tint: 'kw' }, { t: ' count = ' }, { t: 'state', tint: 'fn' }, { t: '(0);' }]);
	[...COMPILE, ...RENDER].forEach((p, i) => {
		k.row(p.key, 0.6, 1.1, p.path, 'mono');
		k.hand(p.key, 0.6, 2.3, p.job, 'show', 500 + i * 450);
	});
	PLACES.forEach((place, i) => k.row('place' + i, 0.6, 1.4, place, 'ui', 'show', 3200 + i * 150));
	k.next();
	k.arrow(['file', 4, 3.2], ['compiler', 5, -1.4], 'draw', 200, 0.6, true);
	k.arrow(['compiler', 9.7, 1.6], ['bundler', -0.15, 1.6], 'draw', 900, 0, true);
	k.arrow(['bundler', 5, 3.1], ['runtime', 3.3, -1.4], 'draw', 1500, -0.5, true);
	PLACES.forEach((_, i) => k.arrow(['runtime', 2.4 + i * 0.6, 3.15], ['place' + i, 2.4, -0.1], 'draw', 2600 + i * 120, 0, true));
	return k.build();
}
