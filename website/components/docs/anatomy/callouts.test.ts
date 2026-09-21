import { describe, expect, it } from 'vitest';
import { calloutsFor } from './callouts.ts';
import { scenes } from './scenes.ts';

describe('visible anatomy labels', () => {
	it('connects each distinct drawn part to its full component name', () => {
		for (const [family, scene] of Object.entries(scenes)) {
			const callouts = calloutsFor(family, scene);
			expect(callouts.map((label) => label.part).sort()).toEqual(
				[...new Set(scene.shapes.map((shape) => shape.part))].sort(),
			);
			for (const label of callouts) {
				expect(label.name).toBe(`${family}.${label.part}`);
				const shape = scene.shapes.find((shape) => shape.part === label.part)!;
				expect(label.targetX).toBeGreaterThanOrEqual(160 + shape.x * .75);
				expect(label.targetX).toBeLessThanOrEqual(160 + (shape.x + shape.width) * .75);
				expect(label.targetY).toBeGreaterThanOrEqual(65 + shape.y * .75);
				expect(label.targetY).toBeLessThanOrEqual(65 + (shape.y + shape.height) * .75);
			}
		}
	});

	it('keeps labels in separate rows in each margin', () => {
		for (const [family, scene] of Object.entries(scenes)) {
			const callouts = calloutsFor(family, scene);
			for (const side of ['left', 'right']) {
				const labels = callouts.filter((label) => label.side === side);
				for (let index = 1; index < labels.length; index++) {
					expect(labels[index]!.y - labels[index - 1]!.y).toBeGreaterThanOrEqual(48);
				}
			}
		}
	});
});
