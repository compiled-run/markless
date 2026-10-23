import { state } from '@markless/core';
import { describeShelf } from './body-value-shelf.ts';

function total(rows: ReadonlyArray<{ readonly count: number }>) {
	let sum = 0;
	for (const row of rows) sum += row.count;
	return sum;
}

export function Ledger() @{
	let shown = state('');
	const rows = [{ name: 'pens', count: 3 }, { name: 'ink', count: 2 }];
	const shelf = { label: 'desk', tags: ['a', 'b'] };
	function first() {
		return rows[0]!;
	}
	<main>
		<button
			type="button"
			data-alias
			onClick={() => {
				const copy = rows;
				const { label, tags } = shelf;
				const [head] = copy;
				shown = `${label}:${tags.join('')}:${head!.name}:${first().count}`;
			}}
		>
			alias
		</button>
		<button type="button" data-helpers onClick={() => (shown = `${total(rows)}:${describeShelf(shelf)}`)}>
			helpers
		</button>
		<button
			type="button"
			data-copy
			onClick={() => {
				const names = rows.toSorted((a, b) => a.count - b.count).map((row) => row.name.toUpperCase());
				names.push('END');
				shown = names.join(',');
			}}
		>
			copy
		</button>
		<output>{shown}</output>
	</main>
}
