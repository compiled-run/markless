import { computed, state } from '@markless/core';
import { getItems, getStock } from './gate.ts';

export function LevelRows({ mark }: { mark: string }) @{
	let round = state(0);
	let level = state(0);
	const items = computed(async () => await getItems(round));
	const stock = computed(async () => await getStock(round));

	<article>
		<button data-level onClick={() => level++}>level</button>
		<button data-again onClick={() => round++}>again</button>
		@try {
			<ul>
				@for (const row of items; key row.id) {
					<li>
						@try {
							<span>
								@if (level > row.id) {
									<s data-level-row>{row.name} above{mark}</s>
								} @else if (level === row.id) {
									<u data-level-row>{row.name} at{mark}</u>
								} @else {
									<q data-level-row>{row.name} below{mark}</q>
								}
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
