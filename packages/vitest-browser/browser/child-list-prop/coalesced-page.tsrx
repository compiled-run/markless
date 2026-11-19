import { state } from '@markless/core';
import { getGroceries, type Grocery } from './groceries.ts';
import { List } from './list.tsrx';

export default function CoalescedPage() @{
	let rows = state<Grocery[] | null>(null);

	<section>
		<button data-load onClick={async () => (rows = await getGroceries())}>Load</button>
		@if (rows === null) {
			<p data-loading>Loading</p>
		}
		<List rows={rows ?? []} />
	</section>
}
