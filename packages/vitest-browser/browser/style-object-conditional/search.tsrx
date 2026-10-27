import { computed, state } from '@markless/core';
import { searchFruit } from './search-fruit.ts';

export function Search() @{
	let query = state('');
	let attempt = state(0);
	let selected = state('apple');
	const results = computed(async () => {
		const q = query;
		const tries = attempt;
		const items = await searchFruit(q, tries);
		return { q, attempt: tries, items };
	});

	<>
		<input value={query} onInput={(event) => (query = event.currentTarget.value)} />
		@try {
			const stale = results.q !== query || results.attempt !== attempt;
			<ul
				aria-busy={stale}
				style={{ opacity: stale ? 0.5 : 1, background: 'transparent', transition: 'opacity 150ms' }}
			>
				@for (const item of results.items; key item.id) {
					<li
						onClick={() => (selected = item.id)}
						style={{ fontWeight: item.id === selected ? 700 : 400 }}
					>
						{item.name}
					</li>
				}
			</ul>
		} @pending {
			<p>Searching...</p>
		} @catch (error) {
			<>
				<p style={{ background: error ? 'rgb(220 38 38 / 0.4)' : 'transparent' }}>{error.message}</p>
				<button onClick={() => (attempt = attempt + 1)}>Try again</button>
			</>
		}
	</>
}
