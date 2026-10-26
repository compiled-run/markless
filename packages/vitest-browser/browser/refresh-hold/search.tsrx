import { computed, state } from '@markless/core';

export function App() @{
	let query = state('');
	const results = computed(async ({ signal }) => {
		const q = query;
		await new Promise((resolve) => setTimeout(resolve, 300));
		if (signal.aborted) return { q: 'aborted', items: [] };
		return { q, items: [q + ' one', q + ' two', q + ' three'] };
	});

	<main>
		<input data-search value={query} onInput={(event) => (query = (event.target as HTMLInputElement).value)} />
		<section data-results>
			@try {
				<ul data-for={results.q}>
					@for (const item of results.items; key item) {
						<li>{item}</li>
					}
				</ul>
			} @pending {
				<p data-pending>Searching</p>
			} @catch {
				<p data-failed>Search failed</p>
			}
		</section>
	</main>
}
