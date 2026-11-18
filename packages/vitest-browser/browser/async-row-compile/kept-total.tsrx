import { computed, state } from '@markless/core';
import { getQuote } from './gate.ts';

export default function KeptTotal() @{
	let count = state(1);
	let round = state(0);
	const quote = computed(async () => await getQuote(round));
	const total = computed(() => `${count} x ${quote.price}`);

	<main>
		@try {
			<p data-total>{total}</p>
		} @pending {
			<p data-total-loading>wait</p>
		} @catch {
			<p data-total-error>failed</p>
		}
		<button data-add onClick={() => count++}>Add one</button>
		<button data-recheck onClick={() => round++}>Check again</button>
	</main>
}
