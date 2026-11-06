// A docs home page in a browser beside a DevTools Coverage panel: the same page, its JavaScript executed at load measured two ways.
import { flatKit, rect, roundRect } from '../how/flat-kit.ts';

export const WIDTH = 680;
export const HEIGHT = 380;

export function drawing() {
	const k = flatKit('c');
	k.windowFrame(10, 52, 300, 300, 'ui.shadcn.com', 9000);
	k.say('print title big', 34, 124, 'Build your');
	k.say('print title big', 34, 150, 'component library');
	k.put('ink faint', k.line([[34, 176], [270, 176]], { w: 0.5, seed: 9001, over: 0 }) + k.line([[34, 192], [240, 192]], { w: 0.5, seed: 9002, over: 0 }));
	const go = roundRect(34, 226, 156, 260, 10, 5);
	k.put('paper', k.pathOf(go, true));
	k.put('wash pink', k.wash(go, 9003, 1, 2));
	k.put('ink', k.outline(go, { w: 1.3, heavy: 1, seed: 9004 }));
	k.say('label button-label', 46, 248, 'Get Started');
	const browse = roundRect(168, 226, 290, 260, 10, 5);
	k.put('paper', k.pathOf(browse, true));
	k.put('ink', k.outline(browse, { w: 1.2, seed: 9005 }));
	k.say('label button-label', 180, 248, 'Components');

	k.card(roundRect(330, 52, 670, 352, 8, 5), 9100, { shadow: 6 });
	k.put('hatch light', k.hatch(rect(332, 54, 336, 24), 0.1, 2.4, 9101, { cluster: 6, skip: 0.2 }));
	k.put('ink', k.line([[330, 78], [670, 78]], { w: 0.9, seed: 9102 }) + k.line([[330, 290], [670, 290]], { w: 0.7, seed: 9103, over: 0 }));
	k.say('print title', 342, 71, 'Coverage');

	const sw = [roundRect(10, 8, 250, 38, 14, 6), roundRect(256, 8, 500, 38, 14, 6)];
	for (const [i, s] of sw.entries()) {
		k.put('paper', k.pathOf(s, true));
		k.put('ink', k.outline(s, { w: 1.2, heavy: 1, seed: 9110 + i }));
	}
	return {
		width: WIDTH,
		height: HEIGHT,
		layers: k.layers,
		words: k.words,
		switches: [
			{ key: 'browser', wash: k.wash(sw[0]!, 9120, 1, 2), x: 26, y: 28, text: 'work done in the browser' },
			{ key: 'compile', wash: k.wash(sw[1]!, 9121, 1, 2), x: 272, y: 28, text: 'worked out at compile time' },
		],
		hits: {
			go: k.pathOf(rect(30, 222, 130, 42), true),
			browse: k.pathOf(rect(164, 222, 130, 42), true),
			rows: [0, 1, 2].map((i) => k.pathOf(rect(334, 92 + i * 40, 332, 36), true)),
			browser: k.pathOf(rect(10, 8, 240, 30), true),
			compile: k.pathOf(rect(256, 8, 244, 30), true),
		},
		rowY: [0, 1, 2].map((i) => 116 + i * 40),
		bar: { x: 342, y: 302, w: 310, h: 18, frame: k.outline(rect(342, 302, 310, 18), { w: 1, seed: 9130 }) },
		total: { x: 342, y: 340 },
		rowBar: { x: 520, w: 136 },
	};
}
