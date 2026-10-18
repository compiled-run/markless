import { state } from '@markless/core';
import { ColumnHeader, SortHeader, type Column } from './rcc-cells.tsrx';

export default function RowChildCapturesPage() @{
	let sortKey = state('');
	let closed = state('');
	let cols = state<Column[]>([
		{ id: 'serial', name: 'Serial' },
		{ id: 'time', name: 'Time' },
	]);
	<main>
		<button
			type="button"
			data-add
			onClick={() => (cols = [...cols, { id: 'args', name: 'Args' }])}
		>
			add
		</button>
		<div data-props>
			@for (const col of cols; key col.id) {
				<ColumnHeader col={col} onSort={(id) => (sortKey = id)} />;
			}
		</div>
		<output data-sort>{sortKey}</output>
		<div data-closures>
			@for (const col of cols; key col.id) {
				<SortHeader label={col.name} onSort={() => (closed = col.id)} />;
			}
		</div>
		<output data-closed>{closed}</output>
	</main>;
}
