import { state } from '@markless/core';

type Row = { id: number; name: string; count: number };

// demos/dbmon/fixture/data.ts reorder, called from demos/dbmon/fixture/app.tsrx:17: a sort with a comparator.
function reorder(rows: Row[], direction: number): Row[] {
	return rows.slice().sort((left, right) => direction * (Number(right.count) - Number(left.count)) || left.id - right.id);
}

export function App() @{
	let rows = state<Row[]>([
		{ id: 1, name: 'alpha', count: 3 },
		{ id: 2, name: 'beta', count: 9 },
		{ id: 3, name: 'gamma', count: 3 },
	]);
	let direction = state(1);
	<main>
		<ul>
			@for (row of rows; key row.id) {
				<li>{row.name}</li>
			}
		</ul>
		<button
			onClick={() => {
				direction = -direction;
				rows = reorder(rows, direction);
			}}
		>
			Sort
		</button>
	</main>
}
