import { computed } from '@markless/core';
import { GaugeStrip } from './gauge-strip.tsrx';

// Route-page twin of harbor-page.tsrx: the same multi-boundary composed child
// shape mounted through the ROUTER's client route swap (dispatchRouteUpdate),
// which adds the D8 navigation hold + settle-tracker path a plain CSR mount
// never exercises.
export default function HarborRoute({ params }) @{
	const tide = computed(async ({ signal }) => {
		await new Promise((resolve) => setTimeout(resolve, 10));
		if (signal.aborted) return { level: 'aborted' };
		return { level: 'high:' + params.pier };
	});

	<main>
		@try {
			<output data-tide>{tide.level}</output>
		} @pending {
			<p data-tide-wait>scanning</p>
		} @catch {
			<p data-tide-broken>broken</p>
		}
		<GaugeStrip params={params} />
	</main>
}
