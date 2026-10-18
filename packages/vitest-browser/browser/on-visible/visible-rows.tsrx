import { state } from '@markless/core';

export function App() @{
	let rows = state([{ id: 'a' }]);
	let seen = state(0);

	<main>
		<button
			type="button"
			data-add
			onClick={() => (rows = [...rows, { id: `r${rows.length}` }])}
		>
			Add
		</button>
		<output data-seen>{seen}</output>
		<ul>
			@for (const row of rows; key row.id) {
				<li data-row={row.id} onVisible={() => (seen = seen + 1)}>
					{row.id}
				</li>;
			}
		</ul>
	</main>;
}
