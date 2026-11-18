import { state } from '@markless/core';
import { Tree } from './tree.tsrx';

export default function TreePage() @{
	let nodes = state([{ key: 'a', amount: 1, children: [{ key: 'a1', amount: 11, children: [] }] }]);
	<main>
		<button type="button" data-add onClick={() => nodes.push({ key: 'b', amount: 2, children: [{ key: 'b1', amount: 21, children: [] }] })}>add</button>
		<Tree nodes={nodes} />
	</main>
}
