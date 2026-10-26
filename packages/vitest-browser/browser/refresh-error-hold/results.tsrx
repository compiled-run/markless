import { computed, state } from '@markless/core';
import { searchFruit } from './search-api.ts';

export function Results() @{
	let query = state('');
	let attempt = state(0);
	const results = computed(async () => searchFruit(query, attempt));

	<>
		<input aria-label="Search fruit" value={query} onInput={(event) => (query = event.currentTarget.value)} />
		<section class="results">
			@try {
				<ul>
					@for (const item of results; key item.id) {
						<li>{item.name}</li>
					}
				</ul>
			} @pending {
				<p>Loading...</p>
			} @catch {
				<p class="failed" role="alert">
					Search failed. <button onClick={() => (attempt = attempt + 1)}>Try again</button>
				</p>
			}
		</section>
		<style>
			ul {
				transition: opacity 0.2s, background-color 0.2s;
			}
			.results[aria-busy='true'] ul {
				opacity: 0.5;
			}
			.results:has(.failed) ul {
				background-color: rgb(220 38 38 / 0.4);
			}
		</style>
	</>
}
