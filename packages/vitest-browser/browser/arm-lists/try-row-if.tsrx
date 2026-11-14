import { computed, state } from '@markless/core';

async function findOrders(round: number) {
	await new Promise((resolve) => setTimeout(resolve, 20));
	return ['x', 'y'].map((id, at) => ({ id, open: (round + at) % 2 === 1 }));
}

export default function TryRowIf() @{
	let round = state(1);
	const orders = computed(async () => await findOrders(round));

	<article>
		<button type="button" data-more onClick={() => round++}>More</button>
		@try {
			<ul>
				@for (const order of orders; key order.id) {
					<li data-order>
						@if (order.open) {
							<span>{order.id} open</span>
						} @else {
							<span>{order.id} shut</span>
						}
					</li>
				}
			</ul>
		} @pending {
			<p data-loading>Loading</p>
		}
	</article>
}
