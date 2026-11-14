import { computed, state } from '@markless/core';
import OrderView from './order-view.tsrx';

async function findOrder(round: number) {
	await new Promise((resolve) => setTimeout(resolve, 20));
	return round % 2 === 0 ? null : { code: `order ${round}`, lines: ['a', 'b', 'c', 'd'].slice(0, round).map((id) => ({ id, text: `note ${id}` })) };
}

export default function TryChildIf() @{
	let round = state(1);
	const order = computed(async () => await findOrder(round));

	<article>
		<button type="button" data-more onClick={() => round++}>More</button>
		@try {
			<section>
				<OrderView order={order} />
			</section>
		} @pending {
			<p data-loading>Loading</p>
		}
	</article>
}
