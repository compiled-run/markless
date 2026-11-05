// The Styling figure's values: the two components, the colours a rule can take, each file's scope class, and what the live region says.
export const COLOURS = ['#f6d6a8', '#c9e4c5', '#f3c4d0', '#c8d8f2', '#e6d4f5'] as const;
export const NAMES = ['peach', 'sage', 'rose', 'sky', 'lilac'] as const;
export const FILES = ['ProfileCard.tsrx', 'ProductCard.tsrx'] as const;

export const nextColour = (index: number) => (index + 1) % COLOURS.length;
/** Pixels of sideways drag per colour step on a swatch. */
export const SCRUB_STEP = 24;
export const scrub = (from: number, startX: number, nowX: number) => (((from + Math.round((nowX - startX) / SCRUB_STEP)) % COLOURS.length) + COLOURS.length) % COLOURS.length;

/** The class Markless adds to every element a file with a style block renders: mk- and an FNV-1a hash of the file's path, base 36. */
export function scopeOf(path: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < path.length; index++) {
		hash ^= path.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return 'mk-' + hash.toString(36);
}

export const SCOPES = FILES.map((file) => scopeOf('src/' + file));

export function describeRepaint(whose: 'global' | 0 | 1, colour: number): string {
	return whose === 'global'
		? `global.css now paints every .card ${NAMES[colour]}: both cards changed.`
		: `${FILES[whose]} painted its own .card ${NAMES[colour]}. The other card, same class name, stayed put.`;
}
