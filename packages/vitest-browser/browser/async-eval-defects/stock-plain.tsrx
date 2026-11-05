import { computed, state } from '@markless/core';
import { getItems, getStock } from './gate.ts';

export default function StockPlain() @{
	let round = state(0);
	const items = computed(async () => await getItems());
	const stock = computed(async () => await getStock(round));

	<main>
		<button data-again onClick={() => round++}>again</button>
		@try {
			<ul>
				@for (const item of items; key item.id) {
					<li data-row>
						<span>{item.name}</span>
						@try {
							<b data-stock>{stock.length}</b>
						} @pending {
							<i data-stock-loading>…</i>
						}
					</li>
				}
			</ul>
		} @pending {
			<p data-loading>Loading…</p>
		}
	</main>
}
