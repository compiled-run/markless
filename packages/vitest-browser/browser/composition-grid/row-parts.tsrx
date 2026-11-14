import type { Row } from './grid-server.ts';

export function RowLabel({ label }: { label: string }) @{
	<span>{label}</span>
}

export function RowEdit({ id }: { id: string }) @{
	<a href={`/grid/edit/${id}`} >edit</a>
}

export default function RowParts({ row }: { row: Row }) @{
	<li data-g="row"><RowLabel label={row.label} /><RowEdit id={row.id} /></li>
}
