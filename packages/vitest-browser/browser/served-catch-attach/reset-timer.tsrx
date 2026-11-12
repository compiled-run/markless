import { computed, state } from '@markless/core';
import { loadForecast, noteCleanup } from './service.ts';

export function ResetTimer() @{
	let city = state('Austin');
	const weather = computed(async ({ signal }) => loadForecast(city, signal));

	<section>
		@try {
			<p data-ok>{weather.summary}</p>
		} @catch (error, reset) {
			<div
				data-host
				attach={() => {
					const timer = setTimeout(reset, 1000);
					return () => {
						clearTimeout(timer);
						noteCleanup();
					};
				}}
				onIdle={() => {}}
			>
				<p data-error>{error.message}</p>
			</div>
		}
		<button onClick={() => (city = 'Boston')}>Boston</button>
	</section>
}
