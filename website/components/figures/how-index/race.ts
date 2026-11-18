// Two inked browser windows holding the shadcn/ui docs home page: the original and the Markless port, side by side.
import { flatKit, rect, roundRect } from '../how/flat-kit.ts';

export const WIDTH = 680;
export const HEIGHT = 450;

const WIN = { y: 34, w: 324, h: 292 };

function page(k: ReturnType<typeof flatKit>, x: number, url: string, seed: number) {
	const y = WIN.y;
	k.windowFrame(x, y, WIN.w, WIN.h, url, seed);
	const top = y + 26;
	const logo = roundRect(x + 12, top + 9, x + 26, top + 23, 3, 3);
	k.put('ink fill-ink', k.pathOf(logo, true));
	k.put('paper', k.line([[x + 16, top + 20], [x + 21, top + 12]], { w: 1.1, seed: seed + 1, over: 0 }) + k.line([[x + 19, top + 20], [x + 24, top + 12]], { w: 1.1, seed: seed + 2, over: 0 }));
	k.say('print tiny-bold', x + 32, top + 20, 'shadcn/ui');
	['Docs', 'Components', 'Blocks'].forEach((label, i) => k.say('print tiny', x + 84 + [0, 28, 82][i]!, top + 20, label));
	const search = roundRect(x + 246, top + 8, x + 314, top + 24, 5, 3);
	k.put('paper', k.pathOf(search, true));
	k.put('ink faint', k.outline(search, { w: 0.7, seed: seed + 3 }));
	k.say('print tiny faint-text', x + 252, top + 20, 'Search…');
	k.put('ink faint', k.line([[x, top + 32], [x + WIN.w, top + 32]], { w: 0.5, seed: seed + 4, over: 0 }));
	const cx = x + WIN.w / 2;
	const pill = roundRect(cx - 62, top + 44, cx + 62, top + 60, 8, 4);
	k.put('paper', k.pathOf(pill, true));
	k.put('ink', k.outline(pill, { w: 0.7, seed: seed + 5 }));
	k.say('print tiny', cx - 52, top + 56, 'New · AI Elements →');
	k.say('print hero', cx - 104, top + 86, 'The Foundation for your');
	k.say('print hero', cx - 60, top + 106, 'Design System');
	k.put('ink faint', k.line([[cx - 110, top + 120], [cx + 110, top + 120]], { w: 0.5, seed: seed + 6, over: 0 }) + k.line([[cx - 86, top + 129], [cx + 86, top + 129]], { w: 0.5, seed: seed + 7, over: 0 }));
	const go = roundRect(cx - 92, top + 140, cx - 6, top + 162, 6, 4);
	const view = roundRect(cx + 4, top + 140, cx + 104, top + 162, 6, 4);
	k.put('paper', k.pathOf(view, true));
	k.put('ink', k.outline(view, { w: 0.9, seed: seed + 8 }));
	k.say('print tiny-bold', cx + 14, top + 155, 'View Components');
	const tile = (tx: number, w: number, s: number) => {
		const poly = roundRect(tx, top + 178, tx + w, top + 254, 6, 4);
		k.put('paper', k.pathOf(poly, true));
		k.put('ink', k.outline(poly, { w: 0.8, seed: s }));
		return tx;
	};
	const a = tile(x + 12, 90, seed + 10);
	[0, 1, 2].forEach((i) => {
		const b = roundRect(a + 10, top + 190 + i * 20, a + 72, top + 204 + i * 20, 4, 3);
		k.put(i === 0 ? 'ink fill-ink' : 'paper', k.pathOf(b, true));
		k.put('ink', k.outline(b, { w: 0.6, seed: seed + 11 + i }));
	});
	const bt = tile(x + 110, 84, seed + 20);
	[0, 1, 2].forEach((i) => {
		const b = roundRect(bt + 10 + (i % 2) * 34, top + 192 + Math.floor(i / 2) * 22, bt + 40 + (i % 2) * 34, top + 204 + Math.floor(i / 2) * 22, 6, 3);
		k.put(i === 0 ? 'ink fill-ink' : 'paper', k.pathOf(b, true));
		k.put('ink', k.outline(b, { w: 0.6, seed: seed + 21 + i }));
	});
	const ct = tile(x + 202, 110, seed + 30);
	k.say('print tiny-bold', ct + 8, top + 194, 'Savings Targets');
	[0, 1].forEach((i) => {
		k.say('print tiny', ct + 8, top + 212 + i * 20, i === 0 ? 'Retirement' : 'Real Estate');
		const bar = rect(ct + 8, top + 216 + i * 20, 92, 4);
		k.put('ink faint', k.outline(bar, { w: 0.5, seed: seed + 31 + i }));
		k.put('ink fill-ink', k.pathOf(rect(ct + 8, top + 216 + i * 20, i === 0 ? 60 : 30, 4), true));
	});
	return { go: { poly: k.pathOf(go, true), ink: k.outline(go, { w: 1, seed: seed + 9 }), hit: k.pathOf(rect(cx - 96, top + 136, 94, 30), true), x: cx - 82, y: top + 155, wash: k.wash(go, seed + 40, 0.8, 1.6) } };
}

export function drawing() {
	const k = flatKit('r');
	const original = page(k, 6, 'shadcn/ui · original', 7000);
	const port = page(k, 350, 'shadcn/ui · Markless port', 7100);
	const meter = (x: number, seed: number) => {
		const frame = rect(x + 4, 372, WIN.w - 8, 16);
		return { frame: k.outline(frame, { w: 1, seed }), x: x + 4, y: 372, w: WIN.w - 8, h: 16 };
	};
	return {
		width: WIDTH,
		height: HEIGHT,
		layers: k.layers,
		words: k.words,
		original: { ...original, meter: meter(6, 7200), label: { x: 10, y: 352 }, figures: { x: 10, y: 408 }, chunk: { x: 10, y: 434 } },
		port: { ...port, meter: meter(350, 7210), label: { x: 354, y: 352 }, figures: { x: 354, y: 408 }, chunk: { x: 354, y: 434 } },
	};
}
