import { computed, state } from '@markless/core';
import { loadForecast } from './service.ts';

export function WritesState() @{
	let seen = state(0);
	const weather = computed(async ({ signal }) => loadForecast('Dallas', signal));

	<section>
		@try {
			<p data-ok>{weather.summary}</p>
		} @catch (error) {
			<div
				data-host
				attach={() => {
					seen++;
				}}
				onIdle={() => {}}
			>
				<p data-error>{error.message}</p>
				<p data-seen>{seen}</p>
			</div>
		}
	</section>
}
