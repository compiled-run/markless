import { computed, state } from '@markless/core';
import { answer } from './gates.ts';

// A's 'a1,a2' is 5 chars (> 2, so 12 past orders); B's 'b1' is 2 chars (3 past orders), as in stores.tsrx.
const ordersOf = { A: ['a1', 'a2'], B: ['b1'] } as Record<string, string[]>;

export function RefreshCatch() @{
	let storeId = state('A');
	let query = state('mug');
	const orders = computed(async () => answer(`rc-orders:${storeId}`, ordersOf[storeId]));
	const pastOrders = computed(async () => {
		try {
			const ids = orders.join(',');
			const term = query;
			return await answer(`rc-past:${ids}:${term}`, ids.length > 2 ? 12 : 3);
		} catch (e) {
			throw new Error('Search unavailable', { cause: e as Error });
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
