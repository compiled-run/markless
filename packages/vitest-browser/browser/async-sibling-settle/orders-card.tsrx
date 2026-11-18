import { computed } from '@markless/core';
import { load } from './gate.ts';

export default function OrdersCard() @{
	const orders = computed(async () => await load('orders', 'profile', [{ id: 7, item: 'Lamp' }]));

	<section>
		@try {
			<ul data-orders>
				@for (const order of orders; key order.id) {
					<li>{order.item}</li>
				}
			</ul>
		} @pending {
			<span data-orders-pending>Orders loading</span>
		} @catch {
			<span data-orders-failed>Orders failed</span>
		}
	</section>
}
