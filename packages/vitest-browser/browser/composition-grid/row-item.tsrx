import type { Row } from './grid-server.ts';

export default function RowItem({ row }: { row: Row }) @{
	<li data-g="row">{row.label}</li>
}
