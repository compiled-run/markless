import { computed, state } from '@markless/core';
import { loadForecast } from './forecast.ts';

export default function RetryLater() @{
	let city = state('Austin');
	const weather = computed(async ({ signal }) => loadForecast(city, signal));

	<section>
		@try {
			<p>{weather.summary}</p>
		} @catch (error, reset) {
			<div
				attach={() => {
					const timer = setTimeout(reset, 1000);
					return () => clearTimeout(timer);
				}}
				onIdle={() => {}}
			>
				<p>{error.message}</p>
			</div>
		}
		<button onClick={() => (city = 'Boston')}>Boston</button>
	</section>
}
