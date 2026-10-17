import { state } from '@markless/core';

export function App() @{
	let rows = state([{ id: 'a' }]);

	<main>
		<button type="button" data-add onClick={() => (rows = [...rows, { id: `r${rows.length}` }])}>Add</button>
		<ul>
			@for (const row of rows; key row.id) {
				<li
					data-row={row.id}
					onIdle={() => {
						const host = globalThis as { __idleArmRuns?: number };
						host.__idleArmRuns = (host.__idleArmRuns ?? 0) + 1;
					}}
				>
					{row.id}
				</li>
			}
		</ul>
	</main>
}
