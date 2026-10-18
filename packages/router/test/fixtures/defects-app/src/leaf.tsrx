export type LeafNode = { readonly key: string; readonly obj: boolean };

export function Leaf({ node }: { readonly node: LeafNode }) @{
	<div data-imported-row>
		<span>{node.key}</span>
		@if (node.obj) {
			<span>obj</span>;
		} @else {
			<span>val</span>;
		}
	</div>;
}
