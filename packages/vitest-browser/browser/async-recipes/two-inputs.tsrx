import { computed, state } from '@markless/core';
import { loadForecast } from './forecast.ts';

export default function TwoInputs() @{
	let city = state('Austin');
	let unit = state('C');
	const forecast = computed(async ({ signal }) =>
		loadForecast(`${city} ${unit}`, signal),
	);

	<section>
		@try {
			<p>{forecast.summary}</p>
		} @pending {
			<p>Checking the sky</p>
		}
		<button onClick={() => { city = 'Denver'; unit = 'F'; }}>Both</button>
	</section>
}
