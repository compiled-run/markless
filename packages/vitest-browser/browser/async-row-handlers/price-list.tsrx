import { computed, state } from '@markless/core';
import { fetchPrices } from './fetch-rows.ts';

export default function PriceList() @{
	let round = state(0);
	const prices = computed(async () => await fetchPrices(round));

	<div>
		<button data-reload onClick={() => round++}>reload</button>
		@try {
			<dl>
				<dt data-count>{prices.length} items</dt>
				@for (const price of prices; key price.sku) {
					<dd data-sku={price.sku}><label>{price.label}</label><input /></dd>
				}
			</dl>
		} @pending {
			<i>loading</i>
		}
	</div>
}
