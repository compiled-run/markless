import { computed, state } from '@markless/core';
import { loadForecast } from './forecast.ts';

export default function TwoInputsSteps() @{
	let city = state('Austin');
	let unit = state('C');
	let note = state('none');
	const forecast = computed(async ({ signal }) =>
		loadForecast(`${city} ${unit}`, signal),
	);
	const tide = computed(async ({ signal }) => loadForecast(`tide ${note}`, signal));

	<section>
		@try {
			<>
				<p>{forecast.summary}</p>
				<p>{tide.summary}</p>
			</>
		} @pending {
			<p>Checking the sky</p>
		}
		<button onClick={() => { city = 'Boston'; }}>One</button>
		<button onClick={() => { city = 'Denver'; unit = 'F'; }}>Both</button>
		<button onClick={() => { city = 'Lima'; note = 'high'; }}>Each</button>
	</section>
}
