import { computed, state } from '@markless/core';
import { priceList } from './gated.ts';

function PriceTag({ price, unit }: { price: { amount: number }; unit: string }) @{
	<span data-tag>{price.amount + ' ' + unit}</span>
}

export default function PageStateRows() @{
	let currency = state('EUR');
	const prices = computed(async () => await priceList(currency));

	<div>
		<button type="button" data-usd onClick={() => (currency = 'USD')}>$</button>
		@try {
			<ul>
				@for (const price of prices; key price.sku) {
					<li data-row>
						<i data-text>{price.amount + ' ' + currency}</i>
						<input data-note />
						<PriceTag price={price} unit={currency} />
					</li>
				}
			</ul>
		} @pending {
			<p>Pricing</p>
		}
	</div>
}
