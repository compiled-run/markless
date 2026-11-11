import { computed, state } from '@markless/core';
import { loadForecast } from './forecast.ts';
import { pause } from './pause.ts';

export default function Backoff() @{
	let city = state('Austin');
	let attempt = state(1);
	const weather = computed(async ({ signal }) => {
		const wait = 1000 * 2 ** (attempt - 2);
		if (attempt > 1) await pause(wait, signal);
		return loadForecast(city, signal);
	});

	<section>
		@try {
			<p>{weather.summary}</p>
		} @pending {
			<p>Checking the sky</p>
		} @catch (error) {
			<div
				attach={() => {
					if (attempt < 4) attempt++;
				}}
				onIdle={() => {}}
			>
				<p>{error.message}</p>
				<p>Attempt {attempt} of 4</p>
			</div>
		}
		<button
			onClick={() => {
				city = 'Boston';
				attempt = 1;
			}}
		>
			Boston
		</button>
	</section>
}
