import { computed } from '@markless/core';
import Branch from './branch.tsrx';
import { chain } from './tree.ts';

export default function Chain40() @{
	const trunk = computed(() => chain(40));
	<main data-forest>
		<Branch title={trunk.title} branches={trunk.branches} />
	</main>
}
