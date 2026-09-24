import { state, type Children } from '@markless/core';
import type { TreeNode } from './shared/data.ts';

export default function Disclosure({ node, children }: { readonly node: TreeNode; readonly children?: Children }) @{
	let open = state(false);
	const leaves = node.children!.filter((child) => !child.children);

	<li>
		<button
			type="button"
			class="tree-toggle"
			data-testid={`disclosure-${node.id}`}
			aria-expanded={open ? 'true' : 'false'}
			aria-controls={`disclosure-panel-${node.id}`}
			onClick={() => (open = !open)}
		>{node.label}</button>
		<ul class="tree-panel" id={`disclosure-panel-${node.id}`} data-testid={`disclosure-panel-${node.id}`} hidden={!open}>
			@for (const leaf of leaves; key leaf.id) {
				<li><span class="tree-leaf" data-testid={`tree-leaf-${leaf.id}`}>{leaf.label}</span></li>
			}
			{children}
		</ul>
	</li>
}
