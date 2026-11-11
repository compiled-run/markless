import { computed, state } from '@markless/core';
import { findCities } from './cities.ts';
import { pause } from './pause.ts';

export default function CitySearch() @{
	let query = state('');
	const matches = computed(async ({ signal }) => {
		const text = query;
		if (!text) return [];
		await pause(300, signal);
		return findCities(text, signal);
	});

	<section>
		<input
			value={query}
			onInput={(event) => {
				query = event.currentTarget.value;
			}}
		/>
		@try {
			<ul>
				@for (const city of matches; key city) {
					<li>{city}</li>
				}
			</ul>
		} @pending {
			<p>Searching</p>
		}
	</section>
}
