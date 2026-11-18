import { computed, state } from '@markless/core';
import { loadForecast } from './forecast.ts';
import { retryCounted } from './retry-counted.ts';

export default function BackoffCounted() @{
	let city = state('Austin');
	const weather = computed(async ({ signal }) =>
		retryCounted(() => loadForecast(city, signal), {
			tries: 3,
			signal,
		}),
	);

	<section>
		@try {
			<p>{weather.summary}</p>
		} @pending {
			<p>Checking the sky</p>
		} @catch (error, reset) {
			<div>
				<p>{error.message}</p>
				<button onClick={reset}>Try again</button>
			</div>
		}
		<button onClick={() => (city = 'Boston')}>
			Boston
		</button>
	</section>
}
