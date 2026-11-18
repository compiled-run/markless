import type { Row } from './grid-server.ts';
import Line from './pick-row.tsrx';

export function PickTable({ rows }: { rows: ReadonlyArray<Row> }) @{
	<ul>
		@for (const row of rows; key row.id) {
			<Line row={row} />
		}
	</ul>
}
