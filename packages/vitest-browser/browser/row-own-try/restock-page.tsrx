import { computed, state } from '@markless/core';
import { getItems, getRestock } from './gate.ts';

export default function RestockPage() @{
	let refill = state(0);
	let marks = state(0);
	const items = computed(async () => await getItems(0));
	const stock = computed(async () => await getRestock(refill));

	<section>
		@try {
			<ol>
				@for (const entry of items; key entry.id) {
					<li>
						@try {
							<p>
								<small data-mark>{entry.name} #{marks}</small>
								@if (marks > 2) {
									<em data-high>{entry.name} {stock.find((line) => line.id === entry.id)?.count}</em>
								}
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
		<button data-refill onClick={() => refill++}>refill</button>
	</section>
}
