import { computed, state } from '@markless/core';
import { queryKey, settle } from './query.ts';

export function AsyncObjectKeyPage() @{
	let filter = state({ term: 'a', page: 1 });
	let sort = state({ by: 'name' });
	const results = computed(async () => {
		const key = queryKey(filter);
		await settle(5);
		return 'results ' + key;
	});
	const sorted = computed(async () => {
		const by = sort;
		await settle(5);
		return 'sorted ' + by.by;
	});

	<div>
		@try {
			<output data-results>{results}</output>
		} @pending {
			<p>loading</p>
		} @catch {
			<p>failed</p>
		}
		@try {
			<output data-sorted>{sorted}</output>
		} @pending {
			<p>sorting</p>
		} @catch {
			<p>failed</p>
		}
		<button data-term onClick={() => { filter.term = 'b'; }}>term</button>
		<button data-page onClick={() => { filter.page++; }}>page</button>
		<button data-sort onClick={() => { sort.by = 'date'; }}>sort</button>
	</div>
}
