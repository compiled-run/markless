import { computed } from '@markless/core';
import Branch from './branch.tsrx';
import { grow } from './tree.ts';

export default function Depth6() @{
	const trunk = computed(() => grow(6));
	<main data-forest>
		<Branch title={trunk.title} branches={trunk.branches} />
	</main>
}
