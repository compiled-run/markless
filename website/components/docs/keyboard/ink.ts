// Keycaps drawn by hand: each key is a slightly wobbly rounded box, seeded by its id so every render draws the same keyboard.
import { jitter, roundRect } from '../../figures/ink/desk.ts';
import { pathOf } from '../../figures/ink/ink.ts';

function seedOf(id: string): number {
	let hash = 2166136261;
	for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
	return hash >>> 0;
}

/** The outline of one keycap, `x`, `y`, `width` and `height` in the layout's units. */
export function keyPath(id: string, x: number, y: number, width: number, height: number): string {
	return pathOf(jitter(roundRect(x, y, x + width, y + height, 5, 2), seedOf(id), 1.6), true);
}
