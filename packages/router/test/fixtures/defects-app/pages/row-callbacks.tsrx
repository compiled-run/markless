import { computed, state } from '@markless/core';
import { PickRow, SharedCell, SortCell } from '../src/grid-cells.tsrx';
import { gridState, type Col, type GridItem } from '../src/grid-parts.tsrx';

function LocalPickRow({ name }: { readonly name: string }) @{
	const g = gridState();
	<div role="row" data-local-row={name} onClick={() => (g.picked = g.picked + 1)}>
		<span data-local-cell={name}>{name}</span>
	</div>;
}

export default function RowCallbacksPage() @{
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
		<button type="button" data-reverse onClick={() => (cols = [...cols].reverse())}>
			reverse
		</button>
		<button
			type="button"
			data-add-col
			onClick={() => (cols = [...cols, { id: 'args', name: 'Args' }])}
		>
			add
		</button>
		<div data-headers>
			@for (const col of cols; key col.id) {
				<SortCell label={col.name} onSort={() => (sortKey = col.id)} />;
			}
		</div>
		<output data-sort>{sortKey}</output>
		<div data-shared-headers>
			@for (const col of cols; key col.id) {
				<SharedCell label={col.name} />;
			}
		</div>
		<output data-shared-sort>{sharedSort}</output>
		<div data-rows>
			@for (const item of items; key item.id) {
				<PickRow name={item.name} onPick={() => (picked = item.serial)} />;
			}
		</div>
		<output data-picked>{picked}</output>
		<div data-local-rows>
			@for (const item of items; key item.id) {
				<LocalPickRow name={item.name} />;
			}
		</div>
		<output data-shared-picked>{g.picked}</output>
	</main>;
}
