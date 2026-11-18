import type { Row } from './grid-server.ts';
import PickRow from './pick-row.tsrx';

export function PickTable({ rows }: { rows: ReadonlyArray<Row> }) @{
	<ul>
		@for (const row of rows; key row.id) {
			<PickRow row={row} />
		}
	</ul>
}
