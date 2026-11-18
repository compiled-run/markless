import { computed, state } from '@markless/core';
import { getQuote } from './gate.ts';

export default function Basket() @{
	let count = state(1);
	let round = state(0);
	const quote = computed(async () => await getQuote(round));
	const total = computed(() => `${count} x ${quote.price}`);

	<section>
		@try {
			<>
				<p data-name>{quote.label}</p>
				<p data-total>{total}</p>
			</>
		} @pending {
			<p data-basket-loading>wait</p>
		}
		<button data-add onClick={() => count++}>Add one</button>
	</section>
}
