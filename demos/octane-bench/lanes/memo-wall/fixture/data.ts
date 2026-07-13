export const ROW_COUNT = 1_000;
export const MIDDLE_INDEX = ROW_COUNT >> 1;

export type WallRow = {
	id: number;
	label: string;
	value: number;
	theme: number;
};

const WORDS = [
	'alpha',
	'bravo',
	'charlie',
	'delta',
	'echo',
	'foxtrot',
	'golf',
	'hotel',
	'india',
	'juliet',
	'kilo',
	'lima',
	'mike',
	'november',
	'oscar',
	'papa',
];

function mulberry32(seed: number): () => number {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	};
}

export function makeRows(): WallRow[] {
	const random = mulberry32(0x51ab);
	return Array.from({ length: ROW_COUNT }, (_, index) => ({
		id: index + 1,
		label: `${WORDS[(random() * WORDS.length) | 0]} ${WORDS[(random() * WORDS.length) | 0]} ${index + 1}`,
		value: (random() * 10_000) | 0,
		theme: 0,
	}));
}

export function changeMiddle(rows: WallRow[]): WallRow[] {
	const next = rows.slice();
	const row = next[MIDDLE_INDEX];
	next[MIDDLE_INDEX] = { ...row, value: row.value + 1 };
	return next;
}

export function bumpTheme(rows: WallRow[]): WallRow[] {
	return rows.map((row) => ({ ...row, theme: row.theme + 1 }));
}
