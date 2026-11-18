import { computed, state } from '@markless/core';

export function Catalog() @{
	let query = state('a');
	let clicks = state(0);
	const results = computed(async () => {
		const q = query;
		await new Promise((resolve) => setTimeout(resolve, q === 'a' ? 10 : 400));
		if (q === 'broken') throw new Error('Search is down');
		return [q + '1', q + '2'];
	});

	<main>
		<button type="button" data-next onClick={() => (query = 'b')}>B</button>
		<button type="button" data-type-c onClick={() => (query = 'c')}>C</button>
		<button type="button" data-type-d onClick={() => (query = 'd')}>D</button>
		<button type="button" data-type-e onClick={() => (query = 'e')}>E</button>
		<button type="button" data-break onClick={() => (query = 'broken')}>Break</button>
		<button type="button" data-count onClick={() => clicks++}>{clicks}</button>
		<section data-results>
			@try {
				<ul data-list>
					@for (const result of results; key result) {
						<li>{result}</li>
					}
				</ul>
			} @pending {
				<p data-pending>Searching</p>
			} @catch (error) {
				<p data-failed>{error.message}</p>
			}
		</section>
	</main>
}
