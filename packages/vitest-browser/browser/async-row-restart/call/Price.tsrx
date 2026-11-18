import { computed } from '@markless/core';
import { getPrice } from '../gate.ts';

const money = (amount: number) => `$${amount.toLocaleString('en-US')}`;

export default function Price() @{
	const value = computed(async () => await getPrice(0));

	<section>
		@try {
			<p class="price">{money(value.amount)}</p>
		} @pending {
			<p class="pending">wait</p>
		} @catch (error) {
			<p class="error">{`failed: ${error.message}`}</p>
		}
	</section>
}
