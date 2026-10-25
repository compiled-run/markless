import { state } from '@markless/core';
import TreeInner from './tree-inner.tsrx';

export default function TreeOuter({ node }: { node: { readonly label: string; readonly children: ReadonlyArray<unknown> } }) @{
	let open = state(true);

	<div data-outer>
		<button type="button" data-flip onClick={() => (open = !open)}>{open ? 'open' : 'closed'}</button>
		<TreeInner node={node} />
	</div>
}
