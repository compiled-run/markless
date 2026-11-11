import { computed, state } from '@markless/core';
import { loadForecast } from './forecast.ts';

export default function Timeout() @{
	let city = state('Austin');
	const weather = computed(async ({ signal }) => {
		const either = AbortSignal.any([
			signal,
			AbortSignal.timeout(3000),
		]);
		return loadForecast(city, either);
	});

	<section>
		@try {
			<p>{weather.summary}</p>
		} @pending {
			<p>Checking the sky</p>
		} @catch (error) {
			<p>
				{error.name === 'TimeoutError'
					? 'The forecast took too long.'
					: error.message}
			</p>
		}
		<button onClick={() => (city = 'Boston')}>
			Boston
		</button>
	</section>
}
