import { computed, state } from '@markless/core';
import { hrefFor } from './k-href-for.ts';

// An imported function called with an object literal built from an async value, as the router writes <Link params>.
export default function ObjectArgumentPage() @{
	let round = state(0);
	const item = computed(async () => ({ id: `a${round}`, tags: ['x', `t${round}`] }));

	<main>
		<button type="button" onClick={() => (round += 1)}>next</button>
		@try {
			<a data-g="link" href={hrefFor('/items/[id]/edit', { id: item.id })} title={[...item.tags, 'end'].join(' ')}>
				Edit
			</a>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
