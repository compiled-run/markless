import { gridState } from './grid-parts.tsrx';

export function SortCell({
	label,
	onSort,
}: {
	readonly label: string;
	readonly onSort: () => void;
}) @{
	<div role="columnheader" data-sort-cell={label} onClick={() => onSort()}>
		<span data-sort-text={label}>{label}</span>
	</div>;
}

export function PickRow({
	name,
	onPick,
}: {
	readonly name: string;
	readonly onPick: () => void;
}) @{
	<div role="row" data-pick-row={name} onClick={() => onPick()}>
		<span data-pick-cell={name}>{name}</span>
		<span>!</span>
	</div>;
}

export function SharedCell({ label }: { readonly label: string }) @{
	const g = gridState();
	<div role="columnheader" data-shared-cell={label} onClick={() => (g.sort = 'clicked')}>
		<span>{label}</span>
	</div>;
}
