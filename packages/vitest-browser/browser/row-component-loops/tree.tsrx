import { state } from '@markless/core';

function TreeNode({ node }) @{
	let hits = state(0);

	<div data-node={node.id}>
		<span class="name">{node.name}</span>
		<button class="hit" onClick={() => hits++}>{hits}</button>
		<div class="kids">
			@for (const child of node.children; key child.id) {
				<TreeNode node={child} />
			}
		</div>
	</div>
}

function graft(nodes, parentId, leaf) {
	return nodes.map((node) =>
		node.id === parentId
			? { ...node, children: [...node.children, leaf] }
			: { ...node, children: graft(node.children, parentId, leaf) },
	);
}

export default function Outline() @{
	let roots = state([
		{ id: 'a', name: 'Alpha', children: [{ id: 'a1', name: 'Alpha one', children: [] }] },
	]);

	<main>
		<button data-add-root onClick={() => roots = [...roots, { id: 'b', name: 'Beta', children: [{ id: 'b1', name: 'Beta one', children: [] }] }]}>Add root</button>
		<button data-graft-b1 onClick={() => roots = graft(roots, 'b1', { id: 'b1x', name: 'Beta one x', children: [] })}>Graft under b1</button>
		<button data-graft-a1 onClick={() => roots = graft(roots, 'a1', { id: 'a1x', name: 'Alpha one x', children: [] })}>Graft under a1</button>
		<nav class="outline">
			@for (const node of roots; key node.id) {
				<TreeNode node={node} />
			}
		</nav>
	</main>
}
