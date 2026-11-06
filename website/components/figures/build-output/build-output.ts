// Brief (checklist passed). Belief: the same source builds into a different output folder for each host.
// Objects: the source tree (locked, never changes), the terminal with its preset switch, the output tree.
// Action: flip the preset. Change: the terminal re-runs and the output tree redraws in that host's real shape.
// Prevents: "deploying somewhere else means changing my code". Surprise: drag a source file into the output and it slides back.
import { roundRect } from '../ink/desk.ts';
import { hatch, line, outline, type P, pathOf, stroke, wash } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 380;

type Box = { x0: number; y0: number; x1: number; y1: number };
const SOURCE: Box = { x0: 14, y0: 66, x1: 206, y1: 330 };
const TERMINAL: Box = { x0: 238, y0: 132, x1: 444, y1: 330 };
const OUTPUT: Box = { x0: 476, y0: 66, x1: 668, y1: 330 };
const ROW = 27;
const TOP = 114;

type Row = { name: string; depth: number; dir: boolean };

/** A paper card standing on the desk: its shadow, paper, a title bar with three dots, and an inked edge. */
function card(b: Box, seed: number) {
	const body = roundRect(b.x0, b.y0, b.x1, b.y1, 10);
	const bar: P[] = [[b.x0, b.y0 + 30], [b.x1, b.y0 + 30]];
	const shadow = roundRect(b.x0 + 8, b.y0 + 10, b.x1 + 9, b.y1 + 9, 12);
	const dots = [0, 1, 2].map((k) => outline(roundRect(b.x0 + 12 + k * 13, b.y0 + 11, b.x0 + 20 + k * 13, b.y0 + 19, 4), { w: 0.8, seed: seed + 10 + k })).join('');
	return {
		shadow: hatch(shadow, -0.7, 2.6, seed, { cluster: 5, skip: 0.3, trim: 0.5 }),
		paper: pathOf(body, true),
		ink: outline(body, { w: 1.9, heavy: 1.4, seed: seed + 1 }) + line(bar, { w: 1, seed: seed + 2, over: 0.2 }) + dots,
		barTone: hatch([[b.x0 + 4, b.y0 + 4], [b.x1 - 4, b.y0 + 4], [b.x1 - 4, b.y0 + 29], [b.x0 + 4, b.y0 + 29]], 0.1, 3, seed + 3, { cluster: 4, skip: 0.35, trim: 0.5 }),
		title: { x: b.x0 + 58, y: b.y0 + 20 },
	};
}

/** A folder or a dog-eared file, drawn small at the start of a tree row. */
function icon(x: number, y: number, dir: boolean, seed: number): string {
	if (dir) {
		const body: P[] = [[x, y - 9], [x + 5, y - 9], [x + 7, y - 7], [x + 14, y - 7], [x + 14, y + 2], [x, y + 2]];
		return outline(body, { w: 0.9, seed });
	}
	const page: P[] = [[x + 1, y - 10], [x + 8, y - 10], [x + 12, y - 6], [x + 12, y + 3], [x + 1, y + 3]];
	return outline(page, { w: 0.9, seed }) + line([[x + 8, y - 10], [x + 8, y - 6], [x + 12, y - 6]], { w: 0.6, seed: seed + 1, over: 0 });
}

/** One tree's rows: where each name sits, its icon, and the pencil guide down the left. */
function tree(b: Box, rows: Row[], seed: number) {
	const placed = rows.map((r, k) => ({ x: b.x0 + 18 + r.depth * 16 + 18, y: TOP + b.y0 - 66 + k * ROW, depth: r.depth, dir: r.dir }));
	const icons = placed.map((p, k) => icon(p.x - 18, p.y, p.dir, seed + k * 3)).join('');
	const guides = placed
		.filter((p) => p.depth > 0)
		.map((p, k) => line([[p.x - 26, p.y - 14], [p.x - 26, p.y - 4], [p.x - 20, p.y - 4]], { w: 0.5, seed: seed + 60 + k, over: 0 }))
		.join('');
	return { icons, guides, at: placed.map((p) => ({ x: p.x, y: p.y })), rowBoxes: placed.map((p) => ({ x: p.x - 22, y: p.y - 15, w: b.x1 - p.x + 12, h: ROW - 4 })) };
}

/** The little padlock on the source card: shackle and body, hatched on its shade side. */
function padlock() {
	const x = SOURCE.x1 - 30;
	const y = SOURCE.y0 + 8;
	const body = roundRect(x, y + 8, x + 16, y + 21, 2);
	const shackle: P[] = Array.from({ length: 11 }, (_, k) => {
		const a = Math.PI + (k / 10) * Math.PI;
		return [x + 8 + Math.cos(a) * 5.5, y + 8 + Math.sin(a) * 6];
	});
	return {
		paper: pathOf(body, true),
		ink: outline(body, { w: 1.1, heavy: 0.8, seed: 801 }) + line(shackle, { w: 1.2, seed: 802, over: 0 }) + stroke([[x + 8, y + 13], [x + 8, y + 17]], { w: 1, seed: 803, over: 0 }),
		shade: hatch([[x + 10, y + 9], [x + 16, y + 9], [x + 16, y + 21], [x + 10, y + 21]], 1.2, 1.6, 804, { cluster: 2, trim: 0.2 }),
	};
}

/** The terminal: a dark screen in an inked bezel, its prompt and the scribbled log lines a build prints. */
function terminalArt() {
	const b = TERMINAL;
	const screen = roundRect(b.x0, b.y0, b.x1, b.y1, 10);
	const shadow = roundRect(b.x0 + 8, b.y0 + 10, b.x1 + 9, b.y1 + 9, 12);
	const log = [0, 1, 2, 3].map((k) => {
		const y = b.y0 + 82 + k * 22;
		const w = [120, 92, 140, 70][k]!;
		const pts: P[] = Array.from({ length: 16 }, (_, i) => [b.x0 + 34 + (i / 15) * w, y + Math.sin(i * 1.9 + k) * 1.4]);
		return stroke(pts, { w: 0.9, seed: 820 + k, over: 0 });
	});
	const tick: P[] = [[b.x0 + 18, b.y0 + 168], [b.x0 + 23, b.y0 + 174], [b.x0 + 32, b.y0 + 160]];
	return {
		shadow: hatch(shadow, -0.7, 2.6, 810, { cluster: 5, skip: 0.3, trim: 0.5 }),
		screen: pathOf(screen, true),
		ink: outline(screen, { w: 2, heavy: 1.5, seed: 811 }),
		log,
		tick: stroke(tick, { w: 1.6, seed: 830, over: 0.2 }),
		prompt: { x: b.x0 + 16, y: b.y0 + 30 },
		preset: { x: b.x0 + 16, y: b.y0 + 54 },
	};
}

/** The preset switch above the terminal: three paper keys in a row, and the wash that marks the chosen one. */
function switchArt() {
	const y0 = 74;
	const spans = [[0, 58], [64, 124], [130, 210]];
	const keys = spans.map(([from, to], k) => {
		const x0 = TERMINAL.x0 + from!;
		const x1 = TERMINAL.x0 + to!;
		const face = roundRect(x0, y0, x1, y0 + 34, 8);
		const side = roundRect(x0 + 2, y0 + 4, x1 + 2, y0 + 38, 8);
		return {
			side: pathOf(side, true),
			paper: pathOf(face, true),
			wash: wash(face, 840 + k, 1.2, 2.5),
			ink: outline(face, { w: 1.2, heavy: 0.9, seed: 850 + k }),
			label: { x: (x0 + x1) / 2, y: y0 + 22 },
		};
	});
	return keys;
}

/** The whole figure, frozen into build-output.art.ts. */
export function drawing() {
	const source = tree(SOURCE, [
		{ name: 'my-app/', depth: 0, dir: true },
		{ name: 'pages/', depth: 1, dir: true },
		{ name: 'index.tsrx', depth: 2, dir: false },
		{ name: 'about.tsrx', depth: 2, dir: false },
		{ name: 'document.tsrx', depth: 1, dir: false },
		{ name: 'vite.config.ts', depth: 1, dir: false },
	], 700);
	const node = tree(OUTPUT, [
		{ name: '.output/', depth: 0, dir: true },
		{ name: 'server/', depth: 1, dir: true },
		{ name: 'index.mjs', depth: 2, dir: false },
		{ name: 'public/', depth: 1, dir: true },
		{ name: 'build/', depth: 2, dir: true },
	], 900);
	const vercel = tree(OUTPUT, [
		{ name: '.vercel/output/', depth: 0, dir: true },
		{ name: 'functions/', depth: 1, dir: true },
		{ name: '__server.func/', depth: 2, dir: true },
		{ name: 'static/', depth: 1, dir: true },
		{ name: 'config.json', depth: 1, dir: false },
	], 1000);
	const cloudflare = tree(OUTPUT, [
		{ name: '.output/', depth: 0, dir: true },
		{ name: 'server/', depth: 1, dir: true },
		{ name: 'index.mjs', depth: 2, dir: false },
		{ name: 'wrangler.json', depth: 2, dir: false },
		{ name: 'public/', depth: 1, dir: true },
		{ name: '_headers', depth: 2, dir: false },
	], 1100);
	return {
		width: WIDTH,
		height: HEIGHT,
		source: { card: card(SOURCE, 600), tree: source, lock: padlock() },
		output: { card: card(OUTPUT, 650), node, vercel, cloudflare, caption: { x: (OUTPUT.x0 + OUTPUT.x1) / 2, y: OUTPUT.y1 + 34 }, drop: { x0: OUTPUT.x0, x1: OUTPUT.x1 } },
		terminal: terminalArt(),
		keys: switchArt(),
	};
}
