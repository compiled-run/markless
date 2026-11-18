import type { Row } from './grid-server.ts';
import { PickRow } from './pick-rows.ts';

export function PickTable({ rows }: { rows: ReadonlyArray<Row> }) @{
	<ul>
		@for (const row of rows; key row.id) {
			<PickRow row={row} />
		}
	</ul>
}
