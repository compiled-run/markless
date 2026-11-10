import { computed, state } from '@markless/core';
import PriceLabel from './price-label.tsrx';
import { priceList } from './gated.ts';

export default function ImportedPageStateRows() @{
	let currency = state('EUR');
	const prices = computed(async () => await priceList(currency));

	<section>
		<button type="button" data-usd onClick={() => (currency = 'USD')}>$</button>
		@try {
			<ol data-list>
				@for (const price of prices; key price.sku) {
					<li data-row data-unit={currency}>
						<textarea data-note></textarea>
						<PriceLabel amount={price.amount} unit={currency} />
					</li>
				}
			</ol>
		} @pending {
			<p>Pricing</p>
		}
	</section>
}
