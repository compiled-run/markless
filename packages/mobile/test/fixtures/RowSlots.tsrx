import { state } from '@markless/core';

export default function RowSlots() @{
	let rows = state([
		{ id: 'a', share: 25 },
		{ id: 'b', share: 50 },
	]);
	<main>
		<ul>
			@for (const row of rows; key row.id) {
				<li style={`width: ${row.share}%`}>{row.id}</li>
			}
		</ul>
		<button onClick={() => (rows = [rows[0]!, { id: 'b', share: 75 }])}>Widen</button>
		<button onClick={() => (rows = [...rows, { id: 'c', share: 10 }])}>Add</button>
		<button onClick={() => (rows = [rows[1]!])}>Drop</button>
	</main>
}
