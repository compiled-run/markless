import { computed, state } from '@markless/core';
import {
	BoundHeader,
	GridRow,
	HeaderCell,
	SharedHeaderCell,
	gridState,
	type Col,
	type GridItem,
} from '../src/grid-parts.tsrx';

function LocalRow({ item }: { readonly item: GridItem }) @{
	const g = gridState();
	<div role="row" data-local-row={item.id} onClick={() => (g.picked = item.serial)}>
		<span data-local-cell={item.id}>{item.name}</span>
	</div>;
}

export default function RowPropsPage() @{
	const g = gridState();
	let sortKey = state('');
	let picked = state(0);
	let cols = state<Col[]>([
		{ id: 'serial', name: 'Serial' },
		{ id: 'time', name: 'Time' },
		{ id: 'channel', name: 'Channel' },
	]);
	let items = state<GridItem[]>([
		{ id: 'a', serial: 1, name: 'alpha' },
		{ id: 'b', serial: 2, name: 'beta' },
		{ id: 'c', serial: 3, name: 'gamma' },
	]);
	const sharedSort = computed(() => `sorted by ${g.sort}`);
	<main>
		<button
			type="button"
			data-add-item
			onClick={() => (items = [...items, { id: 'd', serial: 4, name: 'delta' }])}
		>
			add
		</button>
		<div data-headers>
			@for (const col of cols; key col.id) {
				<HeaderCell col={col} onSort={(id) => (sortKey = id)} />;
			}
		</div>
		<output data-sort>{sortKey}</output>
		<div data-shared-headers>
			@for (const col of cols; key col.id) {
				<SharedHeaderCell col={col} />;
			}
		</div>
		<output data-shared-sort>{sharedSort}</output>
		<div data-rows>
			@for (const item of items; key item.id) {
				<GridRow item={item} onPick={(serial) => (picked = serial)} />;
			}
		</div>
		<output data-picked>{picked}</output>
		<div data-bound-headers>
			@for (const col of cols; key col.id) {
				<BoundHeader col={col} onSort={() => (sortKey = `bound ${col.id}`)} />;
			}
		</div>
		<div data-local-rows>
			@for (const item of items; key item.id) {
				<LocalRow item={item} />;
			}
		</div>
		<output data-shared-picked>{g.picked}</output>
	</main>;
}
