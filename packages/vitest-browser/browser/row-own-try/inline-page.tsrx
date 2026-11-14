import { computed, state } from '@markless/core';
import { getItems, getStock } from './gate.ts';

export default function InlineRowsPage() @{
	let round = state(0);
	const items = computed(async () => await getItems(round));
	const stock = computed(async () => await getStock(round));

	<main>
		<button data-again onClick={() => round++}>again</button>
		@try {
			<ul>
				@for (const item of items; key item.id) {
					<li>
						@try {
							<b data-count>{item.name}: {stock.find((entry) => entry.id === item.id)?.count}</b>
						} @pending {
							<i data-count-loading>…</i>
						}
					</li>
				}
			</ul>
		} @pending {
			<p data-loading>Loading…</p>
		}
	</main>
}
