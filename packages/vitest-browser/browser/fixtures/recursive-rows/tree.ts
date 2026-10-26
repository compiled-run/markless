export type Branch = {
	readonly id: number;
	readonly title: string;
	readonly branches: readonly Branch[];
};

// Spelled in letters: a served digit run is a template value, so a numbered title never appears whole.
export const title = (id: number): string => `branch-${letters(id)}-title`;
const letters = (id: number): string =>
	(id >= 26 ? letters(Math.floor(id / 26) - 1) : '') + String.fromCharCode(97 + (id % 26));

// A full binary tree whose every title is unique, numbered depth-first.
export function grow(depth: number, next = { id: 0 }): Branch {
	const id = next.id++;
	return {
		id,
		title: title(id),
		branches: depth ? [grow(depth - 1, next), grow(depth - 1, next)] : [],
	};
}

// One row per level, each the only row of the one above it.
export function chain(length: number, id = 0): Branch {
	return {
		id,
		title: title(id),
		branches: id + 1 < length ? [chain(length, id + 1)] : [],
	};
}
