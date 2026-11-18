import { computed, state } from '@markless/core';
import { getItems, getStock } from './gate.ts';

export default function RowMarkPage() @{
	let round = state(0);
	let marks = state(0);
	const items = computed(async () => await getItems(round));
	const stock = computed(async () => await getStock(round));

	<section>
		@try {
			<ol>
				@for (const entry of items; key entry.id) {
					<li>
						@try {
							<p>
								<small data-mark>{entry.name} #{marks}</small>
								<b data-count>{entry.name}: {stock.find((line) => line.id === entry.id)?.count}</b>
							</p>
						} @pending {
							<i data-count-loading>…</i>
						}
					</li>
				}
			</ol>
		} @pending {
			<p data-loading>Loading…</p>
		}
		<button data-mark-up onClick={() => (marks += 2)}>mark</button>
		<button data-again onClick={() => round++}>again</button>
	</section>
}
