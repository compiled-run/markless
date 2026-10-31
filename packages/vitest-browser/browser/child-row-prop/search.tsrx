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
		<ul>
			@for (const item of results.items; key item.id) {
				<li data-match={item.name.startsWith(query) ? 'yes' : 'no'} data-query={query}>
					{item.name}
				</li>
			}
		</ul>
	} @pending {
		<p>Searching...</p>
	}
}

export function Search() @{
	let query = state('');

	<>
		<input value={query} onInput={(event) => (query = event.currentTarget.value)} />
		<Results query={query} />
	</>
}
