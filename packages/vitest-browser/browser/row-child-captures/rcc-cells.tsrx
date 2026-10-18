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
