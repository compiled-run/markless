import { track } from 'ripple';
import type { TreeNode } from '../shared/data.ts';

export function TreeGroup({ node }: { node: TreeNode }) @{
	const open = track(false);
	const panelId = `disclosure-panel-${node.id}`;

	<li>
		@if (node.children) {
			<>
				<button
					type="button"
					class="tree-toggle"
					data-testid={`disclosure-${node.id}`}
					aria-expanded={open.value ? 'true' : 'false'}
					aria-controls={panelId}
					onClick={() => (open.value = !open.value)}
				>
					{node.label}
				</button>
				<ul class="tree-panel" id={panelId} data-testid={panelId} hidden={!open.value}>
					@for (const child of node.children; key child.id) {
						<TreeGroup node={child} />
					}
				</ul>
			</>
		} @else {
			<span class="tree-leaf" data-testid={`tree-leaf-${node.id}`}>{node.label}</span>
		}
	</li>
}
