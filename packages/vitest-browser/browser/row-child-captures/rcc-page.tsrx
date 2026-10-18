import { state } from '@markless/core';
import { SortHeader } from './rcc-cells.tsrx';

type Column = { readonly id: string; readonly name: string };

export default function RowChildCapturesPage() @{
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
		<div data-closures>
			@for (const col of cols; key col.id) {
				<SortHeader label={col.name} onSort={() => (closed = col.id)} />;
			}
		</div>
		<output data-closed>{closed}</output>
	</main>;
}
