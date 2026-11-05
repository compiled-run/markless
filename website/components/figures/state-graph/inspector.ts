// A playlist page beside a graph inspector: the nodes and edges the compiler records for it.
import { flatKit, rect, roundRect } from '../how/flat-kit.ts';
import { FIRST, TITLE } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 360;

export function drawing() {
	const k = flatKit('s');
	k.windowFrame(10, 30, 300, 300, 'music.app', 8000);
	k.say('print title big', 34, 92, TITLE);
	const hits = {
		title: k.pathOf(rect(28, 70, 200, 30), true),
		p: k.pathOf(rect(28, 112, 264, 34), true),
		next: k.pathOf(rect(28, 176, 128, 40), true),
		shuffle: k.pathOf(rect(170, 176, 112, 40), true),
	};
	const button = (x: number, w: number, label: string, seed: number) => {
		const b = roundRect(x, 180, x + w, 212, 10, 5);
		k.put('paper', k.pathOf(b, true));
		k.put('ink', k.outline(b, { w: 1.2, heavy: 1, seed }));
		k.say('label button-label', x + 14, 201, label);
	};
	button(32, 120, 'Slow Train', 8010);
	button(174, 104, 'Shuffle', 8020);

	k.card(roundRect(340, 30, 670, 330, 8, 5), 8100, { shadow: 6 });
	k.put('hatch light', k.hatch(rect(342, 32, 326, 24), 0.1, 2.4, 8101, { cluster: 6, skip: 0.2 }));
	k.put('ink', k.line([[340, 56], [670, 56]], { w: 0.9, seed: 8102 }));
	k.say('print title', 352, 49, 'State graph');
	const at = { playing: [410, 120], heading: [540, 120], p: [612, 220], shuffle: [410, 260] } as const;
	const node = (key: keyof typeof at, w: number, seed: number) => {
		const [cx, cy] = at[key];
		const poly = roundRect(cx - w / 2, cy - 17, cx + w / 2, cy + 17, 15, 6);
		return { key, poly: k.pathOf(poly, true), ink: k.outline(poly, { w: 1.3, heavy: 1, seed }), spot: k.spot(poly, seed + 1), x: cx - w / 2 + 12, y: cy + 5 };
	};
	const nodes = [node('playing', 104, 8110), node('heading', 104, 8120), node('p', 84, 8130), node('shuffle', 104, 8140)];
	const arrow = (a: readonly [number, number], b: readonly [number, number], seed: number) => {
		const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
		const head = (s: number) => k.stroke([[b[0] - Math.cos(ang + s) * 10, b[1] - Math.sin(ang + s) * 10], [b[0], b[1]]], { w: 1.4, seed: seed + (s > 0 ? 1 : 2), over: 0.3 });
		return k.line([[a[0], a[1]], [b[0], b[1]]], { w: 1.6, heavy: 0.6, seed, over: 0.2 }) + head(0.45) + head(-0.45);
	};
	const edges = [
		{ key: 'e1', d: arrow([462, 120], [486, 120], 8150) },
		{ key: 'e2', d: arrow([560, 138], [600, 202], 8160) },
	];
	k.say('pencil-text', 352, 314, 'from the compiler, before the page runs');
	return {
		width: WIDTH,
		height: HEIGHT,
		layers: k.layers,
		words: k.words,
		hits,
		nodes,
		edges,
		pText: { x: 34, y: 134 },
		first: FIRST,
		pSpot: k.spot(roundRect(30, 114, 290, 144, 8, 5), 8200),
		shuffleSpot: k.spot(roundRect(172, 178, 280, 214, 10, 5), 8210),
		nextSpot: k.spot(roundRect(30, 178, 154, 214, 10, 5), 8220),
		note: k.note([350, 44], [228, 16], 8300),
	};
}
