// A sheet of tracing paper laid over app.tsrx: TypeScript checks the traced copy and marks it in red pencil; lifted away, its mark lands on line 4, column 7 of the file, which was never written on.
import { ellipse, roundRect } from '../ink/desk.ts';
import { hatch, outline, pathOf } from '../ink/ink.ts';
import { desk, type P, type Run } from '../ink/sheets.ts';

const row = (i: number) => 2.7 + i * 0.85;
const CODE = 2.2;

export const LINES: Run[][] = [
	[{ t: 'import', tint: 'kw' }, { t: ' { Nav } ' }, { t: 'from', tint: 'kw' }, { t: ' ' }, { t: "'./nav.tsrx'", tint: 'str' }, { t: ';' }],
	[],
	[{ t: 'export function', tint: 'kw' }, { t: ' ' }, { t: 'App', tint: 'fn' }, { t: '() ' }, { t: '@{', tint: 'kw' }],
	[{ t: '  <' }, { t: 'Nav', tint: 'tag' }, { t: ' ' }, { t: 'label', tint: 'fn' }, { t: '={' }, { t: '42', tint: 'num' }, { t: '} />' }],
	[{ t: '}' }],
];

/** Word lengths of the traced lines: the copy is only for the checker, so the drawing doesn't spell it out. */
const TRACED: number[][] = [[1.6, 0.9, 1.2, 0.8, 2.2], [], [1.8, 2.4, 1.6, 0.6], [0.5, 1.1, 0.9, 1.5, 1.3, 0.7], [0.4]];

const W = 15;
const H = row(5) + 0.3;
/** Where the tracing lies once lifted off: below the file, turned a little. */
const AWAY = { du: 2.6, dv: H + 1.6, turn: -0.05 };
const LABEL = '  <Nav '.length;

export function drawing() {
	const k = desk(680, [{ key: 'src', x: 0, y: 0, w: W, h: H, bar: 'editor', title: 'app.tsrx', curl: false }], [
		[AWAY.du - 0.6, AWAY.dv + H + 0.8, 0],
		[AWAY.du + W + 1.2, AWAY.dv - 0.6, 0],
	]);
	k.lay();
	LINES.forEach((runs, i) => {
		k.row('src', 0.9, row(i), String(i + 1), 'num');
		if (runs.length) k.print('src', CODE, row(i), runs);
	});
	k.next();
	const c = Math.cos(AWAY.turn);
	const s = Math.sin(AWAY.turn);
	const over = (u: number, v: number): P => [u + 0.25, v - 0.15];
	const away = (u: number, v: number): P => [AWAY.du + u * c - v * s, AWAY.dv + u * s + v * c];

	const tracing = (place: (u: number, v: number) => P, m: 'flash' | 'show', at: number, until: number) => {
		const cls = (base: string) => base + ' ' + m;
		const style = m === 'flash' ? k.raw.motion('flash', at, '', until) : k.raw.motion('show', at);
		const edge = k.raw.on('src', roundRect(-0.3, 1.1, W + 0.2, H + 0.3, 0.05, 1).map(([u, v]) => place(u, v)), 0.08);
		if (m === 'show') k.raw.path(pathOf(edge, true), cls('sheet-paper light'), style);
		k.raw.path(hatch(edge, 0.25, 9, 2300 + at, { cluster: 1, skip: 0.8, trim: 0.7 }), cls('sheet-hatch faint'), style);
		k.raw.path(outline(edge, { w: 0.8, seed: 2310 + at }), cls('sheet-ink'), style);
		TRACED.forEach((words, i) => {
			let u = CODE + (i === 3 ? 0.6 : 0);
			words.forEach((len) => {
				const a = place(u, row(i) - 0.15);
				const b = place(u + len, row(i) - 0.2);
				k.raw.path(pathOf(k.raw.on('src', [a, b], 0.1)), cls('pen faint'), style);
				u += len + 0.45;
			});
		});
		const ringPts = ellipse(CODE + (LABEL + 2.5) * 0.3, row(3) - 0.22, 1.3, 0.5, 30).map(([u, v]) => place(u, v));
		const mark = m === 'flash' ? k.raw.motion('flash', at + 700, '', until) : style;
		k.raw.path(pathOf(k.raw.on('src', [...ringPts, ringPts[0]!, ringPts[1]!], 0.12)), cls('pen squiggle'), mark);
		if (m === 'show') {
			const [tu, tv] = place(CODE + (LABEL + 5) * 0.3 + 0.4, row(3) - 0.7);
			k.raw.text('src', tu, tv, 'TS2322', 'hand tint-err', 'show', at);
		}
	};
	tracing(over, 'flash', 0, 2600);
	tracing(away, 'show', 2600, 0);
	k.raw.text('src', AWAY.du + 0.6, AWAY.dv + H + 0.9, 'THE TSX COPY, ONLY FOR THE CHECKER', 'hand desk-text', 'show', 2700);

	k.wavy('src', k.col(CODE, LABEL), k.col(CODE, LABEL + 5), row(3), 'draw', 3000);
	k.hand('src', k.col(CODE, 23), row(3), 'LINE 4, COLUMN 7', 'show', 3200);
	return k.build();
}
