import { state } from '@markless/core';
import TreeOuter from './tree-outer.tsrx';

export default function TreePage() @{
	let tree = state({ label: 'a', children: [{ label: 'b', children: [{ label: 'c', children: [] }] }] });

	<main>
		<TreeOuter node={tree} />
	</main>
}
