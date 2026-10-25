export type Branch = { readonly id: number; readonly title: string; readonly branches: readonly Branch[] };

// A full binary tree whose every title is unique, numbered depth-first.
export function grow(depth: number, next = { id: 0 }): Branch {
	const id = next.id++;
	return {
		id,
		title: `branch-${id}-title`,
		branches: depth ? [grow(depth - 1, next), grow(depth - 1, next)] : [],
	};
}

