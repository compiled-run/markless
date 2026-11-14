import { Amount } from './row-parts.tsrx';

type Node = { readonly key: string; readonly amount: number; readonly children: ReadonlyArray<Node> };

export function Tree({ nodes }: { nodes: ReadonlyArray<Node> }) @{
	<ul>
		@for (const node of nodes; key node.key) {
			<li>
				<Amount row={node} />
				<Tree nodes={node.children} />
			</li>
		}
	</ul>
}
