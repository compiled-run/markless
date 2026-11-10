import { computed, state } from '@markless/core';
import { getPrice } from './gate.ts';

const money = (amount: number) => `$${amount.toLocaleString('en-US')}`;

export default function Price() @{
	let round = state(0);
	const value = computed(async () => await getPrice(round));

	<section>
		@try {
			<p data-price>{money(value.amount)}</p>
		} @pending {
			<p data-price-pending>wait</p>
		} @catch (error) {
			<p data-price-error>{`failed: ${error.message}`}</p>
		}
		<button data-again onClick={() => round++}>again</button>
	</section>
}
