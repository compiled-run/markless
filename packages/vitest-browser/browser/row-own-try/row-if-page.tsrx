import { computed, state } from '@markless/core';
import { getItems, getStock } from './gate.ts';

export default function RowIfPage() @{
	let round = state(0);
	let open = state(false);
	let picked = state(0);
	const items = computed(async () => await getItems(round));
	const stock = computed(async () => await getStock(round));

	<section>
		@try {
			<ol>
				@for (const entry of items; key entry.id) {
					<li>
						@try {
							<p>
								@if (open) {
									<small data-open>{entry.name} open</small>
								} @else {
									<small data-shut>{entry.name} shut</small>
								}
								@if (picked === entry.id) {
									<em data-picked>{entry.name}</em>
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
		<button data-toggle onClick={() => (open = !open)}>toggle</button>
		<button data-pick onClick={() => (picked = picked + 1)}>pick</button>
		<button data-again onClick={() => round++}>again</button>
	</section>
}
