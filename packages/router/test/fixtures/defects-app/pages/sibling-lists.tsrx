import { state } from '@markless/core';
import { Leaf, type LeafNode } from '../src/leaf.tsrx';

function LocalLeaf({ node }: { readonly node: LeafNode }) @{
	<div data-local-row>
		<span>{node.key}</span>
		@if (node.obj) {
			<span>obj</span>;
		} @else {
			<span>val</span>;
		}
	</div>;
}

export default function SiblingListsPage() @{
	let roots = state<LeafNode[]>([{ key: 'root', obj: true }]);
	<main>
		<button
			type="button"
			data-fill
			onClick={() =>
				(roots = [
					{ key: 'r', obj: true },
					{ key: 's', obj: false },
				])
			}
		>
			fill
		</button>
		<p>component rows:</p>
		@for (const r of roots; key r.key) {
			<LocalLeaf node={r} />;
		}
		<p>inline if rows:</p>
		@for (const r of roots; key r.key) {
			<div data-inline-row>
				<span>{r.key}</span>
				@if (r.obj) {
					<span>obj</span>;
				} @else {
					<span>val</span>;
				}
			</div>;
		}
		<p>end</p>
		<section data-imported>
			@for (const r of roots; key r.key) {
				<b data-tag>{r.key}</b>;
			}
			@for (const r of roots; key r.key) {
				<Leaf node={r} />;
			}
		</section>
	</main>;
}
