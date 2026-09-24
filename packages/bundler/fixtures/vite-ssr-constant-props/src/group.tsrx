import { state } from '@markless/core';
import type { TreeNode } from './tree.ts';

export function Group({ node }: { readonly node: TreeNode }) @{
	let open = state(false);
	let said = state('');
	let picks = state<TreeNode[]>([]);

	<section class="group" data-group={node.id}>
		<button
			class="toggle"
			aria-expanded={open ? 'true' : 'false'}
			onClick={() => {
				open = !open;
				said = `${node.label}:${node.children!.length}`;
			}}
		>{node.label}</button>
		<output class="said">{said}</output>
		<ul hidden={!open}>
			@for (const leaf of node.children!; key leaf.id) {
				<li data-leaf={leaf.id}>{leaf.label}</li>
			}
		</ul>
		<button class="pick-first" onClick={() => (picks = [node.children![0]!, ...picks])}>first</button>
		<button class="clear" onClick={() => (picks = [])}>clear</button>
		<ol>
			@for (const pick of picks; key pick.id) {
				<li class="picked" data-id={pick.id}>{pick.label}</li>
			}
		</ol>
	</section>
}
