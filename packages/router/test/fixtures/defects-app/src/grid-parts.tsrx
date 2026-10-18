import { shared, state } from '@markless/core';

export type Col = { readonly id: string; readonly name: string };
export type GridItem = { readonly id: string; readonly serial: number; readonly name: string };

export const gridState = shared(
	() => {
		const cells = state({ sort: '', picked: 0 });
		return { ...cells };
	},
	{ scope: 'page' },
);

export function HeaderCell({
	col,
	onSort,
}: {
	readonly col: Col;
	readonly onSort: (id: string) => void;
}) @{
	<div role="columnheader" data-header={col.id} onClick={() => onSort(col.id)}>
		<span data-header-text={col.id}>{col.name}</span>
	</div>;
}

export function SharedHeaderCell({ col }: { readonly col: Col }) @{
	const g = gridState();
	<div role="columnheader" data-shared-header={col.id} onClick={() => (g.sort = col.id)}>
		<span>{col.name}</span>
	</div>;
}

export function GridRow({
	item,
	onPick,
}: {
	readonly item: GridItem;
	readonly onPick: (serial: number) => void;
}) @{
	<div role="row" data-row={item.id} onClick={() => onPick(item.serial)}>
		<span data-cell={item.id}>{item.name}</span>
		<span>{item.serial}</span>
	</div>;
}

export function BoundHeader({
	col,
	onSort,
}: {
	readonly col: Col;
	readonly onSort: () => void;
}) @{
	<div role="columnheader" data-bound-header={col.id} onClick={onSort}>
		<span>{col.name}</span>
	</div>;
}
