import type { Grocery } from './groceries.ts';

function Row({ row }: { row: Grocery }) @{
	<li data-row>{row.name}</li>
}

export function List({ rows }: { rows: Grocery[] }) @{
	<ul>
		@for (const row of rows; key row.id) {
			<Row row={row} />
		}
	</ul>
}
