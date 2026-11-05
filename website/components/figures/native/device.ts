// An iPhone running the early proof beside the layers Xcode's view debugger would pull apart, and three greyed devices not started yet.
import { flatKit, type P, rect, roundRect } from '../how/flat-kit.ts';
import { HEADING, LAYERS, NOT_STARTED } from './model.ts';

export const WIDTH = 680;
export const HEIGHT = 400;

const skew = (x: number, y: number, w: number, h: number, dy: number): P[] => [[x, y + dy], [x + w, y], [x + w, y + h], [x, y + h + dy]];

export function drawing() {
	const k = flatKit('n');
	k.card(roundRect(24, 30, 184, 330, 26, 8), 9600, { shadow: 6, w: 1.8 });
	k.put('ink', k.outline(roundRect(34, 52, 174, 308, 10, 5), { w: 0.9, seed: 9601 }) + k.outline(roundRect(82, 38, 126, 46, 4, 3), { w: 0.8, seed: 9602 }));
	k.say('pencil-text', 70, 350, 'early proof');
	const label = { x: 50, y: 150 };
	const button = roundRect(54, 180, 154, 214, 9, 5);
	const debug = roundRect(210, 30, 400, 62, 12, 6);
	k.put('paper', k.pathOf(debug, true));
	k.put('ink', k.outline(debug, { w: 1.3, heavy: 1, seed: 9610 }));
	k.say('label', 246, 51, 'Debug View Hierarchy');
	k.put('ink', k.outline(rect(222, 40, 14, 12), { w: 0.8, seed: 9611 }) + k.outline(rect(226, 37, 14, 12), { w: 0.8, seed: 9612 }));
	const layers = LAYERS.map((layer, i) => {
		const x = 220 + i * 26;
		const y = 92 + i * 34;
		const poly = skew(x, y, 120, 170 - i * 22, 26);
		return {
			key: layer.key,
			name: layer.name,
			poly: k.pathOf(poly, true),
			ink: k.outline(poly, { w: 1.1, heavy: 0.9, seed: 9620 + i }),
			spot: k.wash(poly, 9640 + i, 0.6, 1.4),
			label: { x: x + 134, y: y + 20 },
			content:
				layer.key === 'label'
					? k.outline(rect(x + 14, y + 50, 86, 12), { w: 0.6, seed: 9680 + i })
					: layer.key === 'button'
						? k.outline(roundRect(x + 20, y + 60, x + 96, y + 84, 7, 4), { w: 0.9, seed: 9680 + i })
						: '',
		};
	});
	const others = NOT_STARTED.map((name, i) => {
		const x = 470 + i * 70;
		const poly = name === 'Android' ? roundRect(x, 296, x + 46, 372, 9, 5) : roundRect(x - 6, 306, x + 54, 360, 4, 3);
		k.put('ghost', k.pathOf(poly, true));
		k.put('desk-ink faint', k.outline(poly, { w: 0.9, seed: 9660 + i }));
		k.say('label desk-label', x - 4, 388, name);
		return name;
	});
	k.say('pencil-text', 470, 286, 'not started');
	return {
		width: WIDTH,
		height: HEIGHT,
		layers: k.layers,
		words: k.words,
		phone: { label, button: k.pathOf(button, true), buttonInk: k.outline(button, { w: 1.2, heavy: 1, seed: 9603 }), buttonWash: k.wash(button, 9604, 0.8, 1.6), title: { x: 74, y: 202 }, heading: HEADING },
		debug: { hit: k.pathOf(debug, true), wash: k.wash(debug, 9613, 1, 2) },
		stack: layers,
		others,
		hits: { phone: k.pathOf(rect(24, 30, 160, 300), true), button: k.pathOf(rect(50, 176, 108, 42), true), label: k.pathOf(rect(44, 128, 130, 30), true) },
		empty: { x: 250, y: 200 },
	};
}
