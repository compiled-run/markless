import { state } from '@markless/core';
import { PickTable } from './pick-table.tsrx';

export default function PickPage() @{
	let rows = state([
		{ id: 'r1', label: 'one' },
		{ id: 'r2', label: 'two' },
	]);
	let added = state(2);

	<main>
		<button type="button" data-grid-add onClick={() => rows.push({ id: `r${++added}`, label: `row ${added}` })}>Add</button>
		<button type="button" data-grid-remove onClick={() => (rows = rows.slice(1))}>Remove</button>
		<button type="button" data-grid-reverse onClick={() => (rows = [...rows].reverse())}>Reverse</button>
		<PickTable rows={rows} />
	</main>
}
