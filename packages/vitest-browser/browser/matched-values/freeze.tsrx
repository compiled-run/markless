import { computed, state } from '@markless/core';
import { answer } from './gates.ts';

export function Freeze() @{
	let qty = state(1);
	const quote = computed(async () => answer(`quote:${qty}`, { total: qty * 100 }));
	const logged = computed(() => `qty:${qty} total:${quote.total}`);

	<main>
		<button type="button" data-plus onClick={() => (qty = qty + 1)}>{qty}</button>
		@try {
			<p data-logged>{logged}</p>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
