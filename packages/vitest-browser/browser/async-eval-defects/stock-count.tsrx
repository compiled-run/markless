import { computed, state } from '@markless/core';
import { getItems, getStock } from './gate.ts';

function countOf(entries: ReadonlyArray<{ id: number; count: number }>, id: number) {
	return entries.find((entry) => entry.id === id)?.count;
}

export default function StockCount() @{
	let round = state(0);
	const items = computed(async () => await getItems());
	const stock = computed(async () => await getStock(round));

	<section>
		@try {
			<div>
				@for (const item of items; key item.id) {
					<p data-row>
						@try {
							<span data-stock>{item.name}: {countOf(stock, item.id)} left</span>
						} @pending {
							<span data-stock-loading>checking</span>
						}
					</p>
				}
			</div>
		} @pending {
			<p data-loading>Loading…</p>
		}
		<button data-again onClick={() => round++}>again</button>
	</section>
}
