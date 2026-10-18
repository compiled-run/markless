export type Column = { readonly id: string; readonly name: string };

export function ColumnHeader({
	col,
	onSort,
}: {
	readonly col: Column;
	readonly onSort: (id: string) => void;
}) @{
	<div role="columnheader" data-col={col.id} onClick={() => onSort(col.id)}>
		<span data-col-text={col.id}>{col.name}</span>
	</div>;
}

export function SortHeader({
	label,
	onSort,
}: {
	readonly label: string;
	readonly onSort: () => void;
}) @{
	<div role="columnheader" data-sort-header={label} onClick={() => onSort()}>
		<span data-sort-text={label}>{label}</span>
	</div>;
}
