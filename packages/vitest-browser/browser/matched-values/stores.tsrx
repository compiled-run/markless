import { computed, state } from '@markless/core';
import { answer } from './gates.ts';

const ordersOf = { A: ['a1', 'a2'], B: ['b1'] } as Record<string, string[]>;

export function Stores() @{
	let storeId = state('A');
	let query = state('mug');
	const orders = computed(async () => answer(`orders:${storeId}`, ordersOf[storeId]));
	const past = computed(async () => {
		const ids = orders.join(',');
		const term = query;
		return answer(`past:${ids}:${term}`, ids.length > 2 ? 12 : 3);
	});

	<section>
		<button type="button" data-store-b onClick={() => (storeId = 'B')}>Store B</button>
		<em data-picked>{storeId}</em>
		@try {
			<h2 data-heading>{`${past} past orders in ${storeId}`}</h2>
		} @pending {
			<p>Searching</p>
		}
	</section>
}
