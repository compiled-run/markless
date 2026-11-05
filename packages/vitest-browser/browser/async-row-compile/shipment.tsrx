import { computed } from '@markless/core';
import { getChapter, getQuote } from './gate.ts';

export function Shipment() @{
	const order = computed(async () => await getQuote(0));
	const route = computed(async () => await getChapter(7));

	<aside>
		@try {
			<>
				<b data-order>{order.label}</b>
				<i data-route>{route.total}</i>
			</>
		} @pending {
			<p data-shipment-loading>wait</p>
		}
	</aside>
}
