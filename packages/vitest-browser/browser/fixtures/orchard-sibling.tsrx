import { computed, state } from '@markless/core';
import { CropBadge } from './crop-badge.tsrx';
import { HarvestPanel } from './harvest-panel.tsrx';

// The layout-component shape: a page-owned async boundary BESIDE a composed
// child that owns its own boundary, under one page. Their ids must stay
// distinct (boundary:0 vs c<N>:boundary:0) and both must settle and stay
// interactive independently.
export function App() @{
	let noted = state('none');
	const forecast = computed(async ({ signal }) => {
		await new Promise((resolve) => setTimeout(resolve, 10));
		if (signal.aborted) return { sky: 'aborted' };
		return { sky: 'Clear' };
	});

	<main>
		<output data-noted>{noted}</output>
		@try {
			<>
				<CropBadge label={forecast.sky} />
				<button type="button" data-note onClick={() => noted = 'noted:' + forecast.sky}>Note</button>
			</>
		} @pending {
			<p class="scanning">Scanning</p>
		} @catch {
			<p class="stormy">Stormy</p>
		}
		<HarvestPanel />
	</main>
}
