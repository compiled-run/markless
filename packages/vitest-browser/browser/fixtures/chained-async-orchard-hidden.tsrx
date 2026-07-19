import { computed, state } from '@markless/core';

export function App() @{
	let cultivar = state('cedar');
	const rootStock = computed(async ({ signal }) => {
		const selected = cultivar;
		await new Promise((resolve) => setTimeout(resolve, 20));
		if (signal.aborted) return { stamp: 'aborted' };
		return { stamp: selected + '-sap' };
	});
	const canopyCard = computed(async ({ signal }) => {
		const stamp = rootStock.stamp;
		await new Promise((resolve) => setTimeout(resolve, 45));
		if (signal.aborted) return { caption: 'aborted' };
		return { caption: 'Canopy ' + stamp };
	});

	<main>
		<button type="button" data-change-cultivar onClick={() => cultivar = 'birch'}>
			Change cultivar
		</button>
		@try {
			<output data-canopy-arm>{canopyCard.caption}</output>
		} @pending {
			<output data-canopy-arm>Planting</output>
		} @catch {
			<output data-canopy-arm>Withered</output>
		}
	</main>
}
