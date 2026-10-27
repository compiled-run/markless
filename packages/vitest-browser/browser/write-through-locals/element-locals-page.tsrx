import { state } from '@markless/core';

export function ElementLocalsPage() @{
	let rows = state([{ id: 1, n: 0 }, { id: 2, n: 0 }, { id: 3, n: 0 }]);

	<div>
		<ul>
			@for (const row of rows; key row.id) {
				<li data-row={row.id}>{row.n}</li>
			}
		</ul>
		<output data-second>{rows[1].n}</output>
		<button data-loop onClick={() => { for (const r of rows) { if (r.id === 2) r.n++; } }}>loop</button>
		<button data-find onClick={() => { const hit = rows.find((r) => r.id === 3); if (hit) hit.n = 7; }}>find</button>
		<button data-each onClick={() => { rows.forEach((r) => { r.n += 10; }); }}>each</button>
		<button data-last onClick={() => { const last = rows.at(-1); if (last) last.n = -1; }}>last</button>
	</div>
}
