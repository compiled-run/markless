// Brief (figure-research checklist passed). Belief: a file's path in pages/ is the address it answers.
// Objects: the editor's file tree, the loose files, the browser. Each maps to code: pages/, a .tsrx file, the URL it serves.
// Action: drag a file into pages/ (or out). Change: the address bar and the page follow; out of pages/, the address is a 404.
// Prevents: "routes are configured somewhere else". Surprise: type a slug in the address bar and it is pencilled into [slug].
import { ellipse, roundRect } from '../ink/desk.ts';
import { hatch, line, outline, type P, pathOf, r1, stroke } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 400;

const EDITOR = { x0: 14, y0: 34, x1: 262, y1: 270 };
const BROWSER = { x0: 290, y0: 34, x1: 666, y1: 376 };
const ADDRESS = { x0: 334, y0: 46, x1: 652, y1: 72 };
const CARD = { w: 124, h: 36 };
/** Where each loose file rests on the desk, and the tree slot it drops into. */
const FILES = {
	about: { desk: [22, 300] as P, slot: [58, 140] as P },
	slug: { desk: [156, 300] as P, slot: [82, 214] as P },
};
/** The drop zone over pages/, in drawing units. */
export const TREE = { x0: EDITOR.x0, y0: 72, x1: EDITOR.x1, y1: EDITOR.y1 };

const rect = (x0: number, y0: number, x1: number, y1: number): P[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const shadowOf = (x0: number, y0: number, x1: number, y1: number, d: number): P[] => [[x0 + d, y1], [x1 + d, y1], [x1 + d, y0 + d], [x1, y0 + d], [x1, y1 - 1], [x0 + d, y1 - 1]];

/** A folder icon drawn in ink, its tab a little raised. */
function folder(x: number, y: number, seed: number) {
	const body: P[] = [[x, y - 9], [x + 6, y - 9], [x + 8, y - 12], [x + 15, y - 12], [x + 17, y - 9], [x + 22, y - 9], [x + 22, y + 4], [x, y + 4]];
	return outline(body, { w: 1, heavy: 0.6, seed }) + hatch(body, 0.2, 2.2, seed + 1, { cluster: 3, skip: 0.3, trim: 0.4 });
}

/** A file icon: a page with its corner folded. */
function fileIcon(x: number, y: number, seed: number) {
	const page: P[] = [[x, y - 12], [x + 9, y - 12], [x + 13, y - 8], [x + 13, y + 4], [x, y + 4]];
	return outline(page, { w: 0.9, heavy: 0.5, seed }) + line([[x + 9, y - 12], [x + 9, y - 8], [x + 13, y - 8]], { w: 0.7, seed: seed + 1, over: 0 });
}

/** The editor window: title bar, the pages/ tree with index.tsrx fixed in it, and dashed slots where files can land. */
function editorArt() {
	const { x0, y0, x1, y1 } = EDITOR;
	const sheet = rect(x0, y0, x1, y1);
	const bar = rect(x0, y0, x1, y0 + 24);
	const dots = [x0 + 12, x0 + 24, x0 + 36].map((x, k) => outline(ellipse(x, y0 + 12, 3.4, 3.4, 14), { w: 0.8, seed: 7010 + k })).join('');
	const slot = (p: P, seed: number) => outline(roundRect(p[0], p[1], p[0] + CARD.w, p[1] + CARD.h - 6, 5), { w: 0.6, seed });
	return {
		shadow: hatch(shadowOf(x0, y0, x1, y1, 10), -0.7, 2.6, 7000, { cluster: 5, skip: 0.3, trim: 0.5 }),
		paper: pathOf(sheet, true),
		ink: outline(sheet, { w: 1.8, heavy: 1.3, seed: 7001 }) + line([[x0, y0 + 24], [x1, y0 + 24]], { w: 0.9, seed: 7002, over: 0 }) + dots,
		bar: hatch(bar, 0.1, 2.4, 7003, { cluster: 6, skip: 0.25 }),
		icons: folder(26, 94, 7020) + fileIcon(52, 124, 7030) + folder(50, 202, 7040),
		guide: line([[37, 100], [37, 248]], { w: 0.5, seed: 7050, over: 0 }) + line([[61, 208], [61, 248]], { w: 0.5, seed: 7051, over: 0 }),
		slots: slot(FILES.about.slot, 7060) + slot(FILES.slug.slot, 7061),
		labels: { pages: [54, 98] as P, index: [72, 128] as P, blog: [78, 206] as P },
	};
}

/** A loose file card: paper with a folded corner, its icon, and where its name and pencilled slug sit. */
function cardArt(at: P, seed: number) {
	const [x, y] = at;
	const card: P[] = [[x, y], [x + CARD.w - 10, y], [x + CARD.w, y + 10], [x + CARD.w, y + CARD.h], [x, y + CARD.h]];
	return {
		shadow: hatch(shadowOf(x, y, x + CARD.w, y + CARD.h, 5), -0.6, 1.8, seed, { cluster: 3, skip: 0.2, trim: 0.3 }),
		paper: pathOf(card, true),
		ink: outline(card, { w: 1.2, heavy: 0.9, seed: seed + 1 }) + line([[x + CARD.w - 10, y], [x + CARD.w - 10, y + 10], [x + CARD.w, y + 10]], { w: 0.8, seed: seed + 2, over: 0 }) + fileIcon(x + 8, y + 24, seed + 3),
		name: [x + 28, y + 25] as P,
	};
}

/** The browser window: its bar, the address field, and the page area with pencil lines for body text. */
function browserArt() {
	const { x0, y0, x1, y1 } = BROWSER;
	const sheet = rect(x0, y0, x1, y1);
	const bar = rect(x0, y0, x1, y0 + 46);
	const field = roundRect(ADDRESS.x0, ADDRESS.y0, ADDRESS.x1, ADDRESS.y1, 8);
	const dots = [x0 + 12, x0 + 24, x0 + 36].map((x, k) => outline(ellipse(x, y0 + 25, 3.4, 3.4, 14), { w: 0.8, seed: 7110 + k })).join('');
	const scribble = (y: number, w: number, k: number) =>
		stroke(Array.from({ length: 22 }, (_, i): P => [x0 + 26 + (i / 21) * w, y + Math.sin(i * 1.6 + k) * 1.5]), { w: 0.8, seed: 7120 + k, over: 0 });
	return {
		shadow: hatch(shadowOf(x0, y0, x1, y1, 10), -0.7, 2.6, 7100, { cluster: 5, skip: 0.3, trim: 0.5 }),
		paper: pathOf(sheet, true),
		ink: outline(sheet, { w: 1.8, heavy: 1.3, seed: 7101 }) + line([[x0, y0 + 46], [x1, y0 + 46]], { w: 0.9, seed: 7102, over: 0 }) + dots,
		bar: hatch(bar, 0.1, 2.4, 7103, { cluster: 6, skip: 0.25 }),
		field: pathOf(field, true),
		fieldInk: outline(field, { w: 1, seed: 7104 }),
		address: [ADDRESS.x0 + 12, ADDRESS.y1 - 8] as P,
		heading: [x0 + 26, y0 + 112] as P,
		big: [(x0 + x1) / 2, y0 + 200] as P,
		lines: scribble(y0 + 156, 250, 1) + scribble(y0 + 180, 300, 2) + scribble(y0 + 204, 220, 3) + scribble(y0 + 228, 280, 4),
		missLine: scribble(y0 + 250, 180, 5),
	};
}

/** The whole figure, frozen into routes.art.ts. */
export function drawing() {
	const offset = (f: { desk: P; slot: P }) => [r1(f.slot[0] - f.desk[0]), r1(f.slot[1] - f.desk[1])] as P;
	return {
		width: WIDTH,
		height: HEIGHT,
		tree: TREE,
		address: ADDRESS,
		editor: editorArt(),
		browser: browserArt(),
		about: { ...cardArt(FILES.about.desk, 7200), into: offset(FILES.about) },
		slug: { ...cardArt(FILES.slug.desk, 7300), into: offset(FILES.slug) },
		slots: `--about-x:${offset(FILES.about)[0]}px;--about-y:${offset(FILES.about)[1]}px;--slug-x:${offset(FILES.slug)[0]}px;--slug-y:${offset(FILES.slug)[1]}px`,
		desk: hatch(rect(8, 340, 280, 356), -0.5, 2.8, 7400, { cluster: 5, skip: 0.35, trim: 0.55 }),
	};
}
