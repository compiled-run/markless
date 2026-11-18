import { computed, state } from '@markless/core';
import { answer } from './gates.ts';

function PriceTag({ price, unit }: { price: { amount: number }; unit: string }) @{
	<span data-tag>{price.amount + ' ' + unit}</span>
}

export function Prices() @{
	let currency = state('EUR');
	const prices = computed(async () =>
		answer(`prices:${currency}`, [
			{ sku: 'mug', amount: currency === 'EUR' ? 10 : 11 },
			{ sku: 'cup', amount: currency === 'EUR' ? 4 : 5 },
		]),
	);

	<div>
		<button type="button" data-usd onClick={() => (currency = 'USD')}>$</button>
		<b data-currency>{currency}</b>
		@try {
			<ul>
				@for (const price of prices; key price.sku) {
					<li data-row>
						<i data-text>{price.amount + ' ' + currency}</i>
						<PriceTag price={price} unit={currency} />
					</li>
				}
			</ul>
		} @pending {
			<p>Pricing</p>
		}
	</div>
}
