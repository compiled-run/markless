import { useState } from 'octane';
import { SIDEBAR_TREE } from './shared/data.ts';
import type { TreeNode } from './shared/data.ts';

function TreeItems(props: { nodes: readonly TreeNode[] }) @{
	@for (const node of props.nodes; key node.id) {
		@if (node.children) {
			<TreeGroup node={node} children={node.children} />
		} @else {
			<li>
				<span class="tree-leaf" data-testid={'tree-leaf-' + node.id}>{node.label}</span>
			</li>
		}
	}
}

function TreeGroup(props: { node: TreeNode; children: readonly TreeNode[] }) @{
	const [open, setOpen] = useState(false);
	const panelId = 'disclosure-panel-' + props.node.id;

	<li>
		<button
			class="tree-toggle"
			type="button"
			data-testid={'disclosure-' + props.node.id}
			aria-expanded={open ? 'true' : 'false'}
			aria-controls={panelId}
			onClick={() => setOpen((value) => !value)}
		>
			{props.node.label}
		</button>
		<ul class="tree-panel" id={panelId} data-testid={panelId} hidden={!open}>
			<TreeItems nodes={props.children} />
		</ul>
	</li>
}

export function Sidebar() @{
	<aside class="sidebar" aria-label="Sections">
		<ul class="tree">
			<TreeItems nodes={SIDEBAR_TREE} />
		</ul>
	</aside>
}
