import { computed, state } from '@markless/core';
import { Amount, Unit } from './row-parts.tsrx';

async function load(unit: string, count: number) {
	return Array.from({ length: count }, (_, at) => ({ sku: `p${at}`, amount: (at + 1) * (unit === 'a' ? 1 : 10) }));
}

export default function RefreshedRows() @{
	let unit = state('a');
	let count = state(1);
	const rows = computed(async () => await load(unit, count));
	<main>
		<button type="button" data-unit onClick={() => (unit = 'b')}>b</button>
		<button type="button" data-more onClick={() => count++}>more</button>
		@try {
			<ol>
				@for (const row of rows; key row.sku) {
					<li><Amount row={row} /><Unit unit={unit} /></li>
				}
			</ol>
		} @pending {
			<p>wait</p>
		}
	</main>
}
