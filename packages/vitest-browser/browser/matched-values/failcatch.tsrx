import { computed, state } from '@markless/core';
import { answer } from './gates.ts';

const ordersOf = { A: ['a1', 'a2'], B: ['b1'] } as Record<string, string[]>;

export function FailCatch() @{
	let storeId = state('A');
	let query = state('mug');
	const orders = computed(async () => answer(`fc-orders:${storeId}`, ordersOf[storeId]));
	const pastOrders = computed(async () => {
		try {
			const ids = orders.join(',');
			const term = query;
			return await answer(`fc-past:${ids}:${term}`, ids.length > 2 ? 12 : 3);
		} catch {
			return -1;
		}
	});

	<section>
		<button type="button" data-store-b onClick={() => (storeId = 'B')}>Store B</button>
		<button type="button" data-cup onClick={() => (query = 'cup')}>Cup</button>
		<em data-picked>{storeId}</em>
		@try {
			<h2 data-heading>{`${pastOrders} past orders in ${storeId}`}</h2>
		} @pending {
			<p>Searching</p>
		} @catch (error) {
			<p data-error>{error.message}</p>
		}
	</section>
}
