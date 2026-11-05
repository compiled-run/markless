import { computed, state } from '@markless/core';
import { searchFruit } from './search-fruit.ts';

export function Search() @{
	// The search reads its own copy, so `query` is live inside @try and comparing them shows a newer search is running.
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
			<ul
				aria-busy={results.q !== query}
				style={results.q !== query ? 'opacity: 0.5' : 'opacity: 1'}
			>
				@for (const item of results.items; key item.id) {
					<li>{item.name}</li>
				}
			</ul>
		} @pending {
			<p>Searching...</p>
		} @catch (error) {
			<>
				<p>{error.message}</p>
				<button onClick={() => (attempt = attempt + 1)}>Try again</button>
			</>
		}
	</>
}
