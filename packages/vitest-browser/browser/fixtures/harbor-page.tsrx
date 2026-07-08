import { computed } from '@markless/core';
import { GaugeStrip } from './gauge-strip.tsrx';

// Page shape for the multi-boundary composed child: page-owned boundary BESIDE
// a composed child owning TWO boundaries, with the page's own computed reading
// the SAME prop object shape ({ params }) it passes to the child — the
// composed page graph keeps ONE synthesized prop:props cell, so the shapes
// must stay compatible (ledgered synthesized-id scoping gap).
export function App() @{
	const tide = computed(async ({ signal }) => {
		await new Promise((resolve) => setTimeout(resolve, 10));
		if (signal.aborted) return { level: 'aborted' };
		return { level: 'high' };
	});

	<main>
		@try {
			<output data-tide>{tide.level}</output>
		} @pending {
			<p data-tide-wait>scanning</p>
		} @catch {
			<p data-tide-broken>broken</p>
		}
		<GaugeStrip params={{ pier: 'north-pier' }} />
	</main>
}
