import { state } from '@markless/core';
import { getGroceries, type Grocery } from './groceries.ts';

export default function GroceriesPage() @{
	let rows = state<Grocery[] | null>(null);

	<section>
		<button data-load onClick={async () => (rows = await getGroceries())}>Load</button>
		@if (rows === null) {
			<p data-loading>Loading</p>
		}
		<ul>
			@for (const row of rows ?? []; key row.id) {
				<li data-row>{row.name}</li>
			}
		</ul>
	</section>
}
