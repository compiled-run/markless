import { computed, state } from '@markless/core';
import { getItems } from './gate.ts';
import { RowCount } from './row-count.tsrx';

export default function RowsPage() @{
	let round = state(0);
	const items = computed(async () => await getItems(round));

	<main>
		<button data-again onClick={() => round++}>again</button>
		@try {
			<ul>
				@for (const item of items; key item.id) {
					<li>
						<RowCount id={item.id} name={item.name} />
					</li>
				}
			</ul>
		} @pending {
			<p data-loading>Loading…</p>
		}
	</main>
}
