import { computed, state } from '@markless/core';
import { answer } from '../matched-values/gates.ts';

export function App() @{
	let city = state('Austin');
	const forecast = computed(async () => {
		const asked = city;
		return answer(`cue:${asked}`, { summary: `Sky over ${asked}` });
	});

	<section>
		<style>
			[aria-busy='true'] {
				opacity: 0.4;
				transition: opacity 0.2s 1s;
			}
		</style>
		<button type="button" data-boston onClick={() => (city = 'Boston')}>Boston</button>
		@try {
			<p data-summary>{forecast.summary}</p>
		} @pending {
			<p data-pending>Checking the sky</p>
		}
	</section>
}
