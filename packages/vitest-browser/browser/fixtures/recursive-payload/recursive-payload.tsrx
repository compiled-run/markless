import { computed } from '@markless/core';
import TreeNode from './tree-node.tsrx';
import { tree } from './tree.ts';

// The Hacker News port's recursive-payload repro: 255 rows, 8 levels deep.
export default function RecursivePayload() @{
	const root = computed(() => tree(7));
	<main>
		<TreeNode label={root.label} kids={root.kids} />
	</main>
}
