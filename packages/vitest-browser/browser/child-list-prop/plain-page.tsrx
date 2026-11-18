import { state } from '@markless/core';
import { getGroceries, type Grocery } from './groceries.ts';
import { List } from './list.tsrx';

export default function PlainPage() @{
	let rows = state<Grocery[]>([]);

	<section>
		<button data-load onClick={async () => (rows = await getGroceries())}>Load</button>
		<List rows={rows} />
	</section>
}
