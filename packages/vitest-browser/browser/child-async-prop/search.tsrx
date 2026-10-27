import { computed, state } from '@markless/core';
import { searchFruit } from './search-fruit.ts';

export function Results({ query }: { query: string }) @{
	let attempt = state(0);
	const results = computed(async () => {
		const q = query;
		const tries = attempt;
		const items = await searchFruit(q, tries);
		return { q, attempt: tries, items };
	});

	@try {
		<ul
			aria-busy={results.q !== query || results.attempt !== attempt}
			style={results.q !== query || results.attempt !== attempt ? 'opacity: 0.5' : 'opacity: 1'}
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
}

export function Search() @{
	let query = state('');

	<>
		<input value={query} onInput={(event) => (query = event.currentTarget.value)} />
		<Results query={query} />
	</>
}
