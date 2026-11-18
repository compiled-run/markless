import { computed, state } from '@markless/core';
import { matchingRows } from './rows-lib.ts';

export default function NestedList() @{
	<section data-nested>
		<Hits />
	</section>
}

function Hits() @{
	const list = state({
		query: 'a',
		rows: [
			{ id: 'n1', label: 'alpha' },
			{ id: 'n2', label: 'beta' },
			{ id: 'n3', label: 'gamma' },
		],
	});
	const shown = computed(() => matchingRows(list.rows, list.query));

	<div>
		<button type="button" data-nested-narrow onClick={() => (list.query = 'mm')}>Narrow</button>
		<ol>
			@for (const row of shown; key row.id) {
				<li data-nested-row={row.id}>{row.label}</li>
			}
		</ol>
	</div>
}
