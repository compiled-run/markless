import { computed, state } from '@markless/core';

export function Ticker() @{
	let symbol = state('ACME');
	const quote = computed(async () => {
		const at = symbol;
		await new Promise((resolve) => setTimeout(resolve, at === 'ACME' ? 10 : 300));
		return { price: at.length * 10 };
	});

	<article>
		<button type="button" data-switch onClick={() => (symbol = 'GLOBEX')}>Globex</button>
		<div aria-live="polite" data-quote-region>
			@try {
				<p data-price>{quote.price}</p>
			} @pending {
				<p>Loading quote</p>
			}
		</div>
	</article>
}
