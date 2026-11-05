// The ink frames of the compiler figure: a source sheet on the left, the compiled pieces on the right, and an arrow between them.
import { flatKit, rect, roundRect } from '../how/flat-kit.ts';

export const WIDTH = 680;
export const HEIGHT = 360;

export function drawing() {
	const k = flatKit('x');
	k.card(roundRect(8, 30, 352, 350, 8, 5), 9400, { shadow: 6 });
	k.put('hatch light', k.hatch(rect(10, 32, 340, 24), 0.1, 2.4, 9401, { cluster: 6, skip: 0.2 }));
	k.put('ink', k.line([[8, 56], [352, 56]], { w: 0.9, seed: 9402 }));
	k.card(roundRect(390, 30, 672, 350, 8, 5), 9410, { shadow: 6 });
	k.put('hatch light', k.hatch(rect(392, 32, 278, 24), 0.1, 2.4, 9411, { cluster: 6, skip: 0.2 }));
	k.put('ink', k.line([[390, 56], [672, 56]], { w: 0.9, seed: 9412 }));
	k.put('ink', k.line([[358, 190], [384, 190]], { w: 1.6, seed: 9413, over: 0.2 }) + k.stroke([[376, 182], [385, 190]], { w: 1.5, seed: 9414, over: 0.3 }) + k.stroke([[376, 198], [385, 190]], { w: 1.5, seed: 9415, over: 0.3 }));
	return { width: WIDTH, height: HEIGHT, layers: k.layers, words: k.words };
}
