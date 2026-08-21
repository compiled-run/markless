import { state } from '@markless/core';

// A plain component - no shared(), no widget - that composes ITSELF. The chunk
// graph has a cycle; how far it unrolls is a render-time answer, decided by a
// PROP, so the arm never flips at runtime.
export default function TreeNode({ depth }) @{
	let count = state(0);

	<div data-tree-node data-depth={depth}>
		<button type="button" data-tree-bump onClick={() => count++}>{count}</button>
		@if (depth > 0) {
			<TreeNode depth={depth - 1} />
		}
	</div>
}
