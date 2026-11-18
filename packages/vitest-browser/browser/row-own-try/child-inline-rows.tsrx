import { computed, state } from '@markless/core';
import { getItems, getStock } from './gate.ts';

export function InlineRows({ unit }: { unit: string }) @{
	let round = state(0);
	const items = computed(async () => await getItems(round));
	const stock = computed(async () => await getStock(round));

	<section>
		<button data-again onClick={() => round++}>again</button>
		@try {
			<ul>
				@for (const item of items; key item.id) {
					<li>
						@try {
							<b data-count>{item.name}: {stock.find((entry) => entry.id === item.id)?.count} {unit}</b>
						} @pending {
							<i data-count-loading>…</i>
						}
					</li>
				}
			</ul>
		} @pending {
			<p data-loading>Loading…</p>
		}
	</section>
}
