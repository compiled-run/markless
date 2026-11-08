// The ink arrow between the compiler figure's source sheet and its slips: "compiles to".
import { flatKit } from '../how/flat-kit.ts';

export const WIDTH = 64;
export const HEIGHT = 24;

export function drawing() {
	const k = flatKit('x');
	k.put('ink', k.line([[4, 13], [56, 11]], { w: 1.7, seed: 9413, over: 0.2 }) + k.stroke([[46, 4], [58, 11]], { w: 1.6, seed: 9414, over: 0.3 }) + k.stroke([[46, 19], [58, 11]], { w: 1.6, seed: 9415, over: 0.3 }));
	return { width: WIDTH, height: HEIGHT, layers: k.layers };
}
