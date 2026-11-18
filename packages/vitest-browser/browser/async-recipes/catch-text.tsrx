import { computed, state } from '@markless/core';
import { loadForecast } from './forecast.ts';

export default function CatchText() @{
	let attempt = state(1);
	const forecast = computed(async ({ signal }) => loadForecast('Austin', signal));

	<section>
		@try {
			<p>{forecast.summary}</p>
		} @catch (error) {
			<p>{error.message} Attempt {attempt} of 4.</p>
		}
		<button onClick={() => attempt++}>Next</button>
	</section>
}
