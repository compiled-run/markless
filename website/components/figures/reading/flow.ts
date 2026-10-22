// A cart list typed on a sheet: the @for row wired through a splice to one row per bag on the shop page, and the @if paragraph wired to a free-shipping note that is only on the page while its test is true.
import { arc, arrowOn, browserBar, camera, clipOn, CODE_FS, codeOf, cord, cornersOf, deskAt, ellipse, noteOn, outline, painter, paintCord, paperOf, type P, pathOf, type Point3, sheet, type SheetSpec, spotOf, wash } from './kit.ts';
import { ADDRESS, BAGS, CART_TITLE, FLOW_CODE, FLOW_FILE, FOR_NOTE, FREE, IF_NOTE } from './model.ts';

type Side = 'left' | 'right';
interface Layout {
	width: number;
	code: SheetSpec;
	page: SheetSpec;
	/** Which side of each row the page clips bite from, and where the splices sit, in page-sheet units. */
	side: Side;
	splices: { rows: P; free: P };
	leave: P;
	leaveFree: P;
	arrive: P;
	reach: number;
	rise: number;
}

const ROW0 = 58;
const PITCH = 22;
const X0 = 22;
/** The page sheet's list: the first row's baseline, the pitch, where names start, and the free-shipping note. */
export const LIST = { base: 74, pitch: 26, x: 30, free: 174 };
const ROW_FS = 14;
/** Measured advance of Shantell Sans 600 at the row size, in ems. */
const ROW_EM = 0.56;

const WIDE: Layout = {
	width: 680,
	code: { x: 0, y: 0, w: 372, h: 278, turn: -0.02 },
	page: { x: 420, y: 56, w: 240, h: 214, turn: 0.025 },
	side: 'left',
	splices: { rows: [-24, 90], free: [-20, 168] },
	leave: [1, 0.1],
	leaveFree: [1, 0.1],
	arrive: [1, 0],
	reach: 3,
	rise: 2.2,
};

const TALL: Layout = {
	width: 360,
	code: { x: 0, y: 0, w: 372, h: 278, turn: -0.015 },
	page: { x: 40, y: 330, w: 240, h: 214, turn: 0.02 },
	side: 'right',
	splices: { rows: [262, 88], free: [262, 166] },
	leave: [1, 0.2],
	leaveFree: [0.5, 0.85],
	arrive: [-1, 0],
	reach: 4,
	rise: 3,
};

const rowBase = (i: number) => LIST.base + i * LIST.pitch;
const widthOf = (text: string, size: number) => [...text].length * ROW_EM * size;

function compose(layout: Layout) {
	const p = painter();
	const right = layout.side === 'right';
	const cam = camera(layout.width, [...cornersOf(layout.code), ...cornersOf(layout.page), deskAt(layout.page, layout.splices.rows[0], layout.splices.rows[1]), deskAt(layout.page, layout.splices.free[0], layout.splices.free[1] + 10)]);
	const code = sheet(cam, layout.code);
	const page = sheet(cam, layout.page);
	const flat = sheet(cam, layout.page, 0);

	paperOf(p, code, cam, 2100);
	paperOf(p, page, cam, 2200);

	p.text('file', FLOW_FILE, code.m(X0, 30));
	const set = codeOf(p, code, FLOW_CODE, X0, ROW0, PITCH);

	const loop = set.find('@for');
	const forNote = noteOn(p, code, [FOR_NOTE.join(' ')], set.x(9), set.base(1), 'note strong');
	p.add('note-line', arrowOn(code, [[forNote.x0 - 4, set.base(1) - 3], [set.x(loop.col + 5), set.base(1) + 1], [set.x(loop.col + 2), set.base(2) - CODE_FS]], 2300));
	const test = set.find(') {', 6);
	const ifEnd = set.x(test.col + test.cols);
	noteOn(p, code, IF_NOTE, ifEnd + 24, set.base(6) - 2, 'note strong');
	p.add('note-line', arrowOn(code, [[ifEnd + 20, set.base(6) - 6], [ifEnd + 12, set.base(6) - 8], [ifEnd + 4, set.base(6) - 5]], 2301));

	const name = set.find('{bag.name}');
	const free = set.find(FREE, 7);
	spotOf(p, code, set.x(name.col), set.base(name.row) - CODE_FS * 0.8, set.x(name.col + name.cols), set.base(name.row) + 2, 2340);
	spotOf(p, code, set.x(free.col), set.base(free.row) - CODE_FS * 0.8, set.x(free.col + free.cols), set.base(free.row) + 2, 2345);
	const nameTip: P = [set.x(name.col + 6), set.base(name.row) + 3];
	const freeTip: P = [set.x(free.col + 8), set.base(free.row) + 3];
	const nameEnd = clipOn(p, code, [nameTip[0] + 6, nameTip[1] + 21], nameTip, 2400);
	const freeEnd = clipOn(p, code, [freeTip[0] + 6, freeTip[1] + 21], freeTip, 2410);

	browserBar(p, page, ADDRESS, 2500);
	p.text('shop', CART_TITLE, page.m(LIST.x - 10, 46));

	const rowClips: Point3[] = [];
	BAGS.forEach((bag, i) => {
		const cls = i === 2 ? 'third' : '';
		const y = rowBase(i) + 14;
		p.add('ink' + (cls ? ' ' + cls : ''), outline(page.on(ellipse(LIST.x - 9, y - 4.5, 2, 2, 10)), { w: 0.8, seed: 2600 + i }));
		p.text('row' + (cls ? ' ' + cls : ''), bag, page.m(LIST.x, y));
		const tip: P = right ? [LIST.x + widthOf(bag, ROW_FS) + 3, y - 5] : [LIST.x - 13, y - 5];
		const rear: P = right ? [tip[0] + 22, tip[1] - 6] : [tip[0] - 22, tip[1] - 5];
		rowClips.push(clipOn(p, page, rear, tip, 2620 + i * 10, cls));
	});

	const freeY = LIST.free;
	const slip = page.on(ellipse(LIST.x + 48, freeY - 5, 58, 12, 28));
	p.add('wash yellow free', wash(slip, 2700, 1, 2.4));
	p.add('wash-edge free', wash(slip, 2701, 0.4, 2));
	p.text('row strong free', FREE, page.m(LIST.x - 4, freeY));
	const freeClipTip: P = right ? [LIST.x + widthOf(FREE, ROW_FS) + 6, freeY - 5] : [LIST.x - 16, freeY - 5];
	const freeClipRear: P = right ? [freeClipTip[0] + 22, freeClipTip[1] + 6] : [freeClipTip[0] - 22, freeClipTip[1] + 4];
	const freeClip = clipOn(p, page, freeClipRear, freeClipTip, 2710, 'free');

	const spliceAt = (spot: P) => flat.at(spot[0], spot[1], 0.15);
	const rowsSplice = spliceAt(layout.splices.rows);
	const freeSplice = spliceAt(layout.splices.free);
	const main = cord(cam, arc(nameEnd, layout.leave, rowsSplice, layout.arrive, layout.reach, layout.rise), 0.17, 2800);
	const ifMain = cord(cam, arc(freeEnd, layout.leaveFree, freeSplice, layout.arrive, layout.reach, layout.rise * 0.8), 0.17, 2810);
	const inward: P = right ? [-1, 0] : [1, 0];
	const branches = rowClips.map((end, i) => cord(cam, arc(rowsSplice, inward, end, inward, 0.8, 0.5, 24), 0.12, 2820 + i * 10));
	const freeBranch = cord(cam, arc(freeSplice, inward, freeClip, inward, 0.8, 0.5, 24), 0.12, 2860);
	branches.forEach((b, i) => paintCord(p, b, i === 2 ? 'third' : ''));
	paintCord(p, freeBranch, 'free');
	paintCord(p, main);
	paintCord(p, ifMain);
	for (const at of [rowsSplice, freeSplice]) {
		const c = cam.proj(at);
		const boot = ellipse(c[0], c[1], 4.2, 3, 14);
		p.add('boot', pathOf(boot, true));
		p.add('ink', outline(boot, { w: 0.8, seed: 2900 + Math.round(c[0]) }));
	}

	return {
		width: layout.width,
		height: cam.height,
		ink: p.ink,
		type: p.type,
		pulses: [
			{ key: 0, cls: 'pulse to-splice', d: main.centre, length: main.length },
			{ key: 1, cls: 'pulse to-splice', d: ifMain.centre, length: ifMain.length },
			{ key: 2, cls: 'pulse to-spot', d: branches[2]!.centre, length: branches[2]!.length },
			{ key: 3, cls: 'pulse to-spot', d: freeBranch.centre, length: freeBranch.length },
		],
	};
}

/** The whole figure, wide and tall, frozen into flow.art.ts. */
export function drawing() {
	return { wide: compose(WIDE), tall: compose(TALL) };
}
