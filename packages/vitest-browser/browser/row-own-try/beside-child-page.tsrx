import { computed, state } from '@markless/core';
import { getItems, getStock } from './gate.ts';
import { Tally } from './tally.tsrx';

export default function BesideChildPage() @{
	let round = state(0);
	let bumps = state(0);
	const items = computed(async () => await getItems(round));
	const stock = computed(async () => await getStock(round));

	<main>
		<Tally label="taps" />
		<button data-again onClick={() => round++}>again</button>
		<button data-bump onClick={() => bumps++}>bump</button>
		@try {
			<ul>
				@for (const item of items; key item.id) {
					<li>
						@try {
							<span>
								<b data-count>{item.name}: {stock.find((entry) => entry.id === item.id)?.count}</b>
								<em data-seen>{bumps}</em>
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
	</main>
}
