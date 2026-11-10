import { computed, state } from '@markless/core';
import { searchFruit } from './search-fruit.ts';

export function Search() @{
	let query = state('');
	let searched = state('');
	const results = computed(async () => {
		const q = searched;
		const items = await searchFruit(q);
		return { q, items };
	});

	<main>
		<input value={query} onInput={(event) => {
			query = event.currentTarget.value;
			searched = event.currentTarget.value;
		}} />
		@try {
			<section>
				<ol aria-busy={results.q !== query} style={results.q !== query ? 'opacity: 0.5' : 'opacity: 1'}>
					@for (const item of results.items; key item.id) {
						<li>{item.name}</li>
					}
				</ol>
				<p data-count>{results.items.length} found</p>
			</section>
		} @pending {
			<p>Searching...</p>
		} @catch (error) {
			<p data-error>{error.message}</p>
		}
	</main>
}
