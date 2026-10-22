// One button element typed on a sheet, its parts named in pencil, and an ink cord from its {bags} to the number on the shop page's button.
import { arc, arrowAt, arrowOn, browserBar, buttonOf, camera, clipOn, CODE_FS, codeOf, cord, cornersOf, deskAt, noteOn, painter, paintCord, paperOf, type P, type Point3, r1, ringOn, sheet, type SheetSpec, spotOf, strikeOn } from './kit.ts';
import { ADDRESS, BUTTON_LABEL, MARGIN_NOTE, PARTS, PARTS_CODE, PARTS_FILE, PRICE, PRODUCT, SHOP } from './model.ts';

interface Layout {
	width: number;
	code: SheetSpec;
	page: SheetSpec;
	/** Where the page clip bites, relative to the live number's slot and baseline, and its boot relative to that bite. */
	clipAt: P;
	clipFrom: P;
	/** Directions the cord leaves the code and arrives at the page, and how far it bows. */
	leave: P;
	arrive: P;
	reach: number;
	rise: number;
	/** The margin note on the desk, in local units, and where its arrow lands on the cord, as a fraction along it. */
	note: P;
	noteAim: number;
	/** The note on one line, or broken in two to fit a narrow desk. */
	noteLines: 1 | 2;
}

const ROW0 = 62;
const PITCH = 24;
const X0 = 22;
/** The button on the page sheet: its corners, the label's start and baseline. */
export const BTN = { x0: 18, y0: 128, x1: 214, y1: 164, label: 28, base: 152 };
/** Where the crossed-out number and the live number sit after the label. */
export const SLOT = { old: 134, now: 152 };
const NUM_FS = 17;
const OLD_FS = 12;

const WIDE: Layout = {
	width: 680,
	code: { x: 0, y: 0, w: 340, h: 212, turn: -0.02 },
	page: { x: 382, y: 4, w: 290, h: 206, turn: 0.025 },
	clipAt: [5, 9],
	clipFrom: [-12, 24],
	leave: [0.35, 0.95],
	arrive: [0.55, -0.85],
	reach: 4.5,
	rise: 2.4,
	note: [250, 268],
	noteAim: 0.55,
	noteLines: 1,
};

const TALL: Layout = {
	width: 360,
	code: { x: 0, y: 0, w: 340, h: 212, turn: -0.015 },
	page: { x: 30, y: 290, w: 290, h: 206, turn: 0.02 },
	clipAt: [14, -6],
	clipFrom: [24, -4],
	leave: [0.45, 0.9],
	arrive: [-0.5, 0.85],
	reach: 5,
	rise: 3,
	note: [24, 238],
	noteAim: 0.32,
	noteLines: 2,
};

function compose(layout: Layout) {
	const p = painter();
	const tipLocal: P = [SLOT.now + layout.clipAt[0], BTN.base + layout.clipAt[1]];
	const rearLocal: P = [tipLocal[0] + layout.clipFrom[0], tipLocal[1] + layout.clipFrom[1]];
	const bounds: Point3[] = [...cornersOf(layout.code), ...cornersOf(layout.page), deskAt({ x: 0, y: 0, w: 1, h: 1, turn: 0 }, layout.note[0] - 10, layout.note[1] + 8), deskAt(layout.page, rearLocal[0], rearLocal[1] + 10)];
	const cam = camera(layout.width, bounds);
	const code = sheet(cam, layout.code);
	const page = sheet(cam, layout.page);
	const desk = sheet(cam, { x: 0, y: 0, w: 1, h: 1, turn: 0 }, 0);

	paperOf(p, code, cam, 100);
	paperOf(p, page, cam, 200);

	p.text('file', PARTS_FILE, code.m(X0, 32));
	const set = codeOf(p, code, PARTS_CODE, X0, ROW0, PITCH);
	const value = set.find('{bags}');
	const handler = set.find('onClick={() => bags++}');
	p.add('pencil-ring handler', ringOn(code, set.x(handler.col) - 2, set.x(handler.col + handler.cols) + 2, set.base(handler.row), 300, 10));

	PARTS.forEach((part, i) => {
		const spot = set.find(part.at, part.row);
		const end = set.x(spot.col + spot.cols);
		const y = set.base(part.row);
		if (part.name === 'text') {
			const at: P = [X0 + 86, set.base(5) + 1];
			noteOn(p, code, [part.name], at[0], at[1]);
			p.add('note-line', arrowOn(code, [[at[0] - 4, at[1] - 6], [at[0] - 18, at[1] - 14], [set.x(spot.col + 6), y + 6]], 320 + i));
			return;
		}
		const gap = part.name === 'value' ? 34 : 24;
		noteOn(p, code, [part.name], end + gap, y);
		p.add('note-line', arrowOn(code, [[end + gap - 4, y - 4], [end + gap / 2, y - 6], [end + 5, y - 4.5]], 320 + i));
	});

	const tipCode: P = [set.x(value.col + 3), set.base(value.row) + 3];
	const rearCode: P = [tipCode[0] + 6, tipCode[1] + 22];
	spotOf(p, code, set.x(value.col), set.base(value.row) - CODE_FS * 0.8, set.x(value.col + value.cols), set.base(value.row) + 2, 340);

	browserBar(p, page, ADDRESS, 400);
	p.text('shop', SHOP, page.m(18, 52));
	p.text('page-text', PRODUCT, page.m(18, 80));
	p.text('price', PRICE, page.m(18, 110));
	const sink = buttonOf(p, page, BTN.x0, BTN.y0, BTN.x1, BTN.y1, 420, 'press');
	p.text('button-text press', BUTTON_LABEL, page.m(BTN.label, BTN.base, 0, 0.05));
	spotOf(p, page, SLOT.now - 3, BTN.base - NUM_FS * 0.78, SLOT.now + 12, BTN.base + 2, 440, 'spot');
	const strike = strikeOn(page, SLOT.old, SLOT.old + 8, BTN.base, OLD_FS, 450);

	const codeEnd = clipOn(p, code, rearCode, tipCode, 500);
	const pageEnd = clipOn(p, page, rearLocal, tipLocal, 520);
	const wire = cord(cam, arc(codeEnd, layout.leave, pageEnd, layout.arrive, layout.reach, layout.rise), 0.17, 600);
	paintCord(p, wire);

	const along = wire.centre.slice(1).split('L');
	const target = along[Math.floor(along.length * layout.noteAim)]!.split(' ').map(Number) as P;
	const noteAt = desk.S(layout.note[0], layout.note[1]);
	const words = MARGIN_NOTE.split(' ');
	const lines = layout.noteLines === 2 ? [words.slice(0, 2).join(' '), words.slice(2).join(' ')] : [MARGIN_NOTE];
	const arrowStart: P = layout.noteLines === 2 ? [noteAt[0] + 128, noteAt[1] - 6] : [noteAt[0] + 60, noteAt[1] - 14];
	const bend: P = [(arrowStart[0] + target[0]) / 2 + 10, (arrowStart[1] + target[1]) / 2 + 4];

	return {
		width: layout.width,
		height: cam.height,
		ink: p.ink,
		type: p.type,
		sink,
		slots: { old: page.m(SLOT.old, BTN.base, 0, 0.05), now: page.m(SLOT.now, BTN.base, 0, 0.05) },
		strike,
		pulse: { d: wire.centre, length: wire.length },
		note: {
			lines: lines.map((text, key) => ({ key, text, x: r1(noteAt[0]), y: r1(noteAt[1] + key * 19) })),
			arrow: arrowAt([arrowStart, bend, target], 700, 7),
		},
	};
}

/** The whole figure, wide and tall, frozen into parts.art.ts. */
export function drawing() {
	return { wide: compose(WIDE), tall: compose(TALL) };
}
