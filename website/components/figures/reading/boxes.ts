// A component typed on a sheet, its body boxed in pencil as the statement container and one {expression} ringed as the expression container, wired to the total on the shop page.
import { arc, arrowOn, browserBar, camera, clipOn, CODE_FS, codeOf, cord, cornersOf, deskAt, noteOn, painter, paintCord, paperOf, type P, ringOn, roundRect, scribble, sheet, type SheetSpec, spotOf } from './kit.ts';
import { ADDRESS, BOXES_CODE, BOXES_FILE, EXPRESSION_NOTE, SHOP, STATEMENTS_NOTE, STEPS, TOTAL_LABEL, WORKING } from './model.ts';

interface Layout {
	width: number;
	code: SheetSpec;
	page: SheetSpec;
	clipAt: P;
	clipFrom: P;
	leave: P;
	arrive: P;
	reach: number;
	rise: number;
}

const ROW0 = 84;
const PITCH = 24;
const X0 = 46;
/** Where the total sits on the page sheet: the label, the number and their baseline. */
export const TOTAL_AT = { label: 18, value: 102, base: 112 };
const TOTAL_FS = 22;

const WIDE: Layout = {
	width: 680,
	code: { x: 0, y: 0, w: 360, h: 262, turn: -0.02 },
	page: { x: 404, y: 22, w: 250, h: 160, turn: 0.03 },
	clipAt: [12, 5],
	clipFrom: [-4, 26],
	leave: [1, -0.25],
	arrive: [0.15, -1],
	reach: 5,
	rise: 2.6,
};

const TALL: Layout = {
	width: 360,
	code: { x: 0, y: 0, w: 360, h: 262, turn: -0.015 },
	page: { x: 56, y: 312, w: 250, h: 160, turn: 0.02 },
	clipAt: [30, -8],
	clipFrom: [24, -4],
	leave: [1, 0.2],
	arrive: [-0.6, 0.8],
	reach: 5,
	rise: 3,
};

function compose(layout: Layout) {
	const p = painter();
	const tipLocal: P = [TOTAL_AT.value + layout.clipAt[0], TOTAL_AT.base + layout.clipAt[1]];
	const rearLocal: P = [tipLocal[0] + layout.clipFrom[0], tipLocal[1] + layout.clipFrom[1]];
	const cam = camera(layout.width, [...cornersOf(layout.code), ...cornersOf(layout.page), deskAt(layout.page, rearLocal[0], rearLocal[1] + 8)]);
	const code = sheet(cam, layout.code);
	const page = sheet(cam, layout.page);

	paperOf(p, code, cam, 1100);
	paperOf(p, page, cam, 1200);

	p.text('file', BOXES_FILE, code.m(layout.code.w - 22, 24), 'end');
	const set = codeOf(p, code, BOXES_CODE, X0, ROW0, PITCH);

	const top = set.base(0) - CODE_FS - 7;
	const bottom = set.base(5) + 9;
	const right = set.x(34) + 8;
	const box = roundRect(X0 - 10, top, right, bottom, 9, 4);
	p.add('note-line', scribble(code.on([...box, box[0]!, box[1]!]), 1300, 0.8).d);
	noteOn(p, code, STATEMENTS_NOTE, X0 - 8, top - 34, 'note strong');
	p.add('note-line', arrowOn(code, [[X0 + 178, top - 22], [X0 + 190, top - 12], [X0 + 184, top - 2]], 1301));

	STEPS.forEach((row, i) => {
		const at: P = [X0 - 26, set.base(row) - 4];
		p.add(`step step-${i}`, scribble(code.on(roundRect(at[0] - 7, at[1] - 7, at[0] + 7, at[1] + 7, 7, 4)), 1310 + i, 0.5).d);
		p.text(`step-text step-${i}`, String(i + 1), code.m(at[0], at[1] + 4), 'middle');
	});

	const expr = set.find('{bags * price}');
	const x0 = set.x(expr.col);
	const x1 = set.x(expr.col + expr.cols);
	const base = set.base(expr.row);
	spotOf(p, code, x0, base - CODE_FS * 0.8, x1, base + 2, 1340);
	p.add('note-line', ringOn(code, x0 - 2, x1 + 2, base, 1320, 10));
	p.text('working', WORKING, code.m(x0 + 4, set.base(5) + 2, -0.02));
	noteOn(p, code, EXPRESSION_NOTE, X0 - 8, bottom + 26, 'note strong');
	p.add('note-line', arrowOn(code, [[X0 + 196, bottom + 12], [x0 + 70, bottom + 4], [x1 - 14, base + 12]], 1321));

	browserBar(p, page, ADDRESS, 1400);
	p.text('shop', SHOP, page.m(18, 52));
	p.text('page-text', 'Your cart', page.m(18, 78));
	p.text('total', TOTAL_LABEL, page.m(TOTAL_AT.label, TOTAL_AT.base));
	spotOf(p, page, TOTAL_AT.value - 3, TOTAL_AT.base - TOTAL_FS * 0.75, TOTAL_AT.value + 28, TOTAL_AT.base + 2, 1440, 'spot');

	const tipCode: P = [x0 + (x1 - x0) * 0.5, base - CODE_FS + 1];
	const rearCode: P = [tipCode[0] + 16, tipCode[1] - 18];
	const codeEnd = clipOn(p, code, rearCode, tipCode, 1500);
	const pageEnd = clipOn(p, page, rearLocal, tipLocal, 1520);
	const wire = cord(cam, arc(codeEnd, layout.leave, pageEnd, layout.arrive, layout.reach, layout.rise), 0.17, 1600);
	paintCord(p, wire);

	return {
		width: layout.width,
		height: cam.height,
		ink: p.ink,
		type: p.type,
		total: page.m(TOTAL_AT.value, TOTAL_AT.base),
		pulse: { d: wire.centre, length: wire.length },
	};
}

/** The whole figure, wide and tall, frozen into boxes.art.ts. */
export function drawing() {
	return { wide: compose(WIDE), tall: compose(TALL) };
}
