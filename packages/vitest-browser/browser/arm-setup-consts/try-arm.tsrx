import { computed, state } from '@markless/core';
import { searchFruit } from './search-fruit.ts';

export function Search() @{
	// The box's own copy: the search reads `searched`, so comparing against `query` shows a newer search is running.
	let query = state('');
	let searched = state('');
	let attempt = state(0);
	const results = computed(async () => {
		const q = searched;
		const tries = attempt;
		const items = await searchFruit(q, tries);
		return { q, attempt: tries, items };
	});

	<>
		<input value={query} onInput={(event) => {
			query = event.currentTarget.value;
			searched = event.currentTarget.value;
		}} />
		@try {
			const stale = results.q !== query;
			<ul aria-busy={stale} style={stale ? 'opacity: 0.5' : 'opacity: 1'}>
				@for (const item of results.items; key item.id) {
					<li>{item.name}</li>
				}
			</ul>
		} @pending {
			const waiting = `Searching for ${query}...`;
			<p>{waiting}</p>
		} @catch (error) {
			const reason = `Failed: ${error.message}`;
			<>
				<p>{reason}</p>
				<button onClick={() => (attempt = attempt + 1)}>Try again</button>
			</>
		}
	</>
}
