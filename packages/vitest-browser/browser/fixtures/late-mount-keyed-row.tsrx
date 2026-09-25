import { state } from '@markless/core';

export function Ledger() @{
	let rows = state([{ id: 1, taps: 0, holds: 0 }]);

	<div>
		<button type="button" data-add onClick={() => rows = [...rows, { id: rows.length + 1, taps: 0, holds: 0 }]}>Add</button>
		<ol>
			@for (const row of rows; key row.id) {
				<li
					data-row={row.id}
					onClick={() => rows = rows.map((item) => item.id === row.id ? { ...item, taps: item.taps + 1 } : item)}
					onDblClick={() => rows = rows.map((item) => item.id === row.id ? { ...item, holds: item.holds + 1 } : item)}
				>{`row ${row.id} ${row.taps}/${row.holds}`}</li>
			}
		</ol>
	</div>
}
