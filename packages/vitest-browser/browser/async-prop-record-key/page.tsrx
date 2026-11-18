import { computed, state } from '@markless/core';
import { answer } from './answers.ts';
import { Badge } from './badge.tsrx';

export default function Page() @{
	let round = state(1);
	const order = computed(async () => await answer({ status: round % 2 === 0 ? 'packed' : 'shipped', round }));

	<main>
		<button type="button" data-more onClick={() => round++}>More</button>
		@try {
			<Badge label={order.status} />
		} @pending {
			<p data-loading>Loading</p>
		}
	</main>
}
