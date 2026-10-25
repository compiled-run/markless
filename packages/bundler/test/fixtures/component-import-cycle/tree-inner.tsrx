import TreeOuter from './tree-outer.tsrx';

type TreeNode = { readonly label: string; readonly children: ReadonlyArray<TreeNode> };

export default function TreeInner({ node }: { node: TreeNode }) @{
	<div data-inner>
		{node.label}
		@for (const child of node.children; key child.label) {
			<TreeOuter node={child} />
		}
	</div>
}
