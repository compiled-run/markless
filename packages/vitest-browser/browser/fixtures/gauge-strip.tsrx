import { computed } from '@markless/core';

// Multi-boundary composed-child fixture (shell-decomposition T003 reproducer):
// ONE child component owning TWO async boundaries, each fed by its own
// computed. Composed by a page, BOTH boundaries must settle on a CSR mount —
// the dashboard's tab-chrome shape (context row + per-tab counters) is exactly
// this. Alternate-shaped per the fixture-hardcoding guardrail: a weather
// gauge strip, not a repo dashboard.
export function GaugeStrip({ params }) @{
	const temperature = computed(async ({ signal }) => {
		await new Promise((resolve) => setTimeout(resolve, 20));
		if (signal.aborted) return { reading: 'aborted' };
		return { reading: '21C:' + params.pier };
	});
	const wind = computed(async ({ signal }) => {
		await new Promise((resolve) => setTimeout(resolve, 30));
		if (signal.aborted) return { reading: 'aborted' };
		return { reading: '9kn:' + params.pier };
	});

	<section data-strip>
		<span data-temp-slot>
			@try {
				<em data-temp>{temperature.reading}</em>
			} @pending {
				<em data-temp-wait>reading</em>
			} @catch {
				<em data-temp-broken>broken</em>
			}
		</span>
		<a data-wind-slot href="#/wind">Wind @try {
			<em data-wind>{wind.reading}</em>
		} @pending {
			<em data-wind-wait>reading</em>
		} @catch {
			<em data-wind-broken>broken</em>
		}</a>
	</section>
}
