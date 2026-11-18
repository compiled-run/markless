import { computed, state } from '@markless/core';
import { loadOrders } from './orders.ts';

export default function Orders() @{
	let tick = state(0);
	const list = computed(async ({ signal }) => {
		tick;
		return loadOrders(signal);
	});

	<section
		attach={() => {
			const timer = setInterval(() => {
				if (!document.hidden) tick++;
			}, 5000);
			return () => clearInterval(timer);
		}}
		onIdle={() => {}}
	>
		@try {
			<ul>
				@for (const order of list; key order.id) {
					<li>{order.item}</li>
				}
			</ul>
		} @pending {
			<p>Loading orders</p>
		}
	</section>
}
