import { describe, expect, it } from 'vitest';
import { layersFor } from './layers.ts';
import { scenes } from './scenes.ts';

describe('exploded anatomy layers', () => {
	it('separates nested parts while keeping sibling content at the same depth', () => {
		const layers = layersFor(scenes.accordion!);
		expect(layers.map((layer) => layer.depth)).toEqual([0, 1, 2, 3, 2]);
		expect(layers[3]!.topLeft.y).toBeLessThan(layers[2]!.topLeft.y);
	});
	it('fits projected drawings between the labels without changing their geometry', () => {
		for (const scene of Object.values(scenes)) {
			const layers = layersFor(scene);
			expect(layers).toHaveLength(scene.shapes.length);
			for (const layer of layers) {
				for (const point of layer.corners) {
					expect(point.x).toBeGreaterThanOrEqual(190 - .001);
					expect(point.x).toBeLessThanOrEqual(610 + .001);
					expect(point.y).toBeGreaterThanOrEqual(80 - .001);
					expect(point.y).toBeLessThanOrEqual(385 + .001);
				}
			}
		}
	});
});
