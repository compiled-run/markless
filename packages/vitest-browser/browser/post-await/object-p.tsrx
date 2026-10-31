import { computed, state } from '@markless/core';
import { load, note } from './loader.ts';

export function ObjectP() @{
	let filters = state({ q: 'a', sort: 'asc' });
	const hits = computed(async ({ signal }) => {
		note('hits');
		const rows = await load('search:' + filters.q, 'rows', signal);
		return rows + ':' + filters.q + ':' + filters.sort;
	});
	<div>
		@try { <output data-o>{hits}</output> } @pending { <p data-p>loading</p> } @catch { <p data-e>err</p> }
		<button data-sort onClick={() => { filters.sort = 'desc'; }}>s</button>
	</div>
}
