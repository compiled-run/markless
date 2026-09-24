import { computed, state } from '@markless/core';
import { Counter } from './try-if-flip-counter.tsrx';

export function Shelf() @{
	let shown = state(false);
	let batch = state(1);
	const stock = computed(async () => {
		const current = batch;
		await new Promise((resolve) => setTimeout(resolve, 15));
		return { name: `Shelf stocked ${current}` };
	});

	<section>
		@try {
			@if (shown) { <Counter unit="boxes" /> }
			<h3 data-stock-name>{stock.name}</h3>
		} @pending {
			<span data-stock-wait>Stocking</span>
		}
		<a href="#" data-reveal onClick={(event) => { event.preventDefault(); shown = !shown; }}>Reveal</a>
		<button type="button" data-restock onClick={() => batch = batch + 1}>Restock</button>
	</section>
}
