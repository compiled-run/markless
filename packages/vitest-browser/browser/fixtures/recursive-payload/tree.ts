export type Tree = { readonly id: number; readonly label: string; readonly kids: readonly Tree[] };

export function tree(depth: number, next = { id: 0 }): Tree {
	const id = next.id++;
	return {
		id,
		label: `node ${id} ${'x'.repeat(8)}`,
		kids: depth ? [tree(depth - 1, next), tree(depth - 1, next)] : [],
	};
}
