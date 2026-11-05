// specs/ as a bound book of statutes lying open: a ribbon marks the index, framework-design.md, one chapter per area, and a flag sticks out at the decisions left open on purpose.
import { hatch, line, outline, pathOf, wash } from '../ink/ink.ts';
import { desk, type P } from '../ink/sheets.ts';

/** The chapters in specs/framework/, as the repo names them; the middle ones are cut to keep the page short. */
export const CHAPTERS = ['00 overview', '01 tsrx host contract', '02 compiler pipeline', '03 state graph', '…', '07 diagnostics', '08 deferred decisions', '…', '14 emission, codegen'];
export const DEFERRED = CHAPTERS.indexOf('08 deferred decisions');

const PAGE = { w: 9.6, h: 11.6 };
const PITCH = 0.9;
const row = (i: number) => 3.4 + i * PITCH;

export function drawing() {
	const k = desk(
		680,
		[
			{ key: 'cover', x: -0.5, y: -0.4, w: PAGE.w * 2 + 1.4, h: PAGE.h + 0.8, kraft: true, curl: false },
			{ key: 'left', x: 0.15, y: 0, w: PAGE.w, h: PAGE.h, turn: 0.01, curl: false },
			{ key: 'right', x: PAGE.w + 0.25, y: 0, w: PAGE.w, h: PAGE.h, turn: -0.01 },
		],
		[[PAGE.w + 0.2, PAGE.h + 3.2, 0]],
	);
	k.lay();
	k.raw.path(hatch(k.raw.on('left', [[PAGE.w - 1.2, 0], [PAGE.w, 0], [PAGE.w, PAGE.h], [PAGE.w - 1.2, PAGE.h]], 0.01), 1.45, 1.6, 3300, { cluster: 4, trim: 0.2 }), 'sheet-hatch light');
	k.raw.path(hatch(k.raw.on('right', [[0, 0], [0.9, 0], [0.9, PAGE.h], [0, PAGE.h]], 0.01), 1.65, 1.8, 3301, { cluster: 3, trim: 0.2 }), 'sheet-hatch light');
	for (let i = 1; i <= 4; i++) k.raw.path(line(k.raw.on('cover', [[0.5, PAGE.h + 0.4 + i * 0.07 - 0.3], [PAGE.w * 2 + 0.9, PAGE.h + 0.4 + i * 0.07 - 0.3]]), { w: 0.4, seed: 3310 + i, over: 0 }), 'sheet-ink');

	k.row('left', 1.2, 1.9, 'specs/', 'big');
	k.row('left', 1.2, row(0) + 0.3, 'framework-design.md', 'bold');
	k.row('left', 1.2, row(1) + 0.3, 'the index, read first', 'ui');
	k.row('left', 1.2, row(3), 'router/', 'mono');
	k.row('left', 1.2, row(4), 'routing, typed routing', 'ui');
	k.row('left', 1.2, row(6), 'archive/', 'mono');
	k.row('left', 1.2, row(7), 'history, not the contract', 'ui');
	k.row('right', 1.3, 1.9, 'framework/', 'big');
	CHAPTERS.forEach((name, i) => k.row('right', 1.3, row(i), name, 'mono'));

	k.next();
	const tab = (u: number, v: number): P[] => k.raw.on('right', [[u, v - 0.55], [u + 1.9, v - 0.62], [u + 2.4, v - 0.1], [u + 1.9, v + 0.38], [u, v + 0.3]], 0.03);
	const flag = tab(PAGE.w - 0.6, row(DEFERRED) - 0.25);
	const flagStyle = k.raw.motion('show', 1500);
	k.raw.path(pathOf(flag, true), 'sheet-paper show', flagStyle);
	k.raw.path(wash(flag, 3321, 0.2, 0.6), 'swipe show', flagStyle);
	k.raw.path(outline(flag, { w: 1, seed: 3320 }), 'sheet-ink show', flagStyle);
	k.raw.text('right', PAGE.w - 0.35, row(DEFERRED) - 0.05, 'OPEN', 'hand', 'show', 1600);
	k.swipe('right', 1.2, k.col(1.3, CHAPTERS[DEFERRED]!.length), row(DEFERRED), 'show', 1300);
	k.strike('left', 1.1, k.col(1.2, 8), row(6) - 0.05, 'draw', 2200);

	const R = 8.6;
	const ribbon = (dx: number): P[] =>
		Array.from({ length: 30 }, (_, i) => {
			const t = i / 29;
			const v = -0.1 + t * (PAGE.h + 2.6);
			const u = R + dx + (v > PAGE.h ? Math.sin((v - PAGE.h) * 1.6) * 0.5 - (v - PAGE.h) * 0.5 : 0);
			return k.raw.on('left', [[u, v]], v > PAGE.h + 0.1 ? -0.02 : 0.06)[0]!;
		});
	const band = [...ribbon(-0.22), ...ribbon(0.22).reverse()];
	const ribbonStyle = k.raw.motion('show', 500);
	k.raw.path(pathOf(band, true), 'kraft show', ribbonStyle);
	k.raw.path(hatch(band, 1.3, 1.8, 3330, { cluster: 3, trim: 0.2 }), 'sheet-hatch show', ribbonStyle);
	k.raw.path(outline(band, { w: 0.9, seed: 3331 }), 'sheet-ink show', ribbonStyle);
	k.ring('left', 1.2, k.col(1.2, 19), row(0) + 0.3, 'draw', 800, 0.46);
	return k.build();
}
