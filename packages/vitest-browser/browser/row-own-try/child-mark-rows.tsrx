import { computed, state } from '@markless/core';
import { getItems, getStock } from './gate.ts';

export function MarkRows({ sign }: { sign: string }) @{
	let round = state(0);
	let ticks = state(0);
	const items = computed(async () => await getItems(round));
	const stock = computed(async () => await getStock(round));

	<article>
		<button data-tick onClick={() => (ticks += 3)}>tick</button>
		<button data-again onClick={() => round++}>again</button>
		@try {
			<ul>
				@for (const row of items; key row.id) {
					<li>
						@try {
							<span>
								<small data-mark>{row.name} {sign}{ticks}</small>
								<b data-count>{row.name}: {stock.find((line) => line.id === row.id)?.count}</b>
							</span>
						} @pending {
							<i data-count-loading>…</i>
						}
					</li>
				}
			</ul>
		} @pending {
			<p data-loading>Loading…</p>
		}
	</article>
}
