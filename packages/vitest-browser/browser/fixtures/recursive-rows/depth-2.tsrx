import { computed } from '@markless/core';
import Branch from './branch.tsrx';
import { grow } from './tree.ts';

export default function Depth2() @{
	const trunk = computed(() => grow(2));
	<main data-forest>
		<Branch title={trunk.title} branches={trunk.branches} />
	</main>
}
