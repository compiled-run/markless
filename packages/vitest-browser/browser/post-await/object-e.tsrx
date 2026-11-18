import { computed, state } from '@markless/core';
import { load, note } from './loader.ts';

export function ObjectE() @{
	let filters = state({ q: 'a', sort: 'asc' });
	const hits = computed(async ({ signal }) => {
		note('hits');
		const q = filters.q;
		const sort = filters.sort;
		const rows = await load('search:' + q, 'rows', signal);
		return rows + ':' + q + ':' + sort;
	});
	<div>
		@try { <output data-o>{hits}</output> } @pending { <p data-p>loading</p> } @catch { <p data-e>err</p> }
		<button data-sort onClick={() => { filters.sort = 'desc'; }}>s</button>
	</div>
}
