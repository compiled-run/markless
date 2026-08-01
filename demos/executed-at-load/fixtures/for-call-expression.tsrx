import { state } from '@markless/core';

function visibleRows(rows: readonly { id: string; label: string }[]) {
	return rows.filter((row) => row.id !== 'hidden');
}

export function ForCallExpression() @{
	let rows = state([
		{ id: 'one', label: 'One' },
		{ id: 'hidden', label: 'Hidden' },
	]);

	<ul>
		@for (const row of visibleRows(rows); key row.id) {
			<li>{row.label}</li>
		} @empty {
			<li>Empty</li>
		}
	</ul>
}
