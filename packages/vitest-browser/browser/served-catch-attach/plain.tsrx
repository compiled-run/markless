import { computed } from '@markless/core';
import { loadForecast } from './service.ts';

function mark(element: HTMLElement) {
	element.setAttribute('data-runs', String(Number(element.getAttribute('data-runs') ?? 0) + 1));
}

export function Plain() @{
	const weather = computed(async ({ signal }) => loadForecast('Waco', signal));

	<section>
		@try {
			<p data-ok>{weather.summary}</p>
		} @catch (error) {
			<div data-host attach={mark} onIdle={() => {}}>
				<p data-error>{error.message}</p>
			</div>
		}
	</section>
}
