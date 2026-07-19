import { computed, state } from '@markless/core';

export function App() @{
	let expanded = state(true);
	const beacon = computed(async ({ signal }) => {
		await new Promise((resolve) => setTimeout(resolve, 25));
		if (signal.aborted) return 'signal aborted';
		return 'Vega signal';
	});

	<section>
		<button type="button" data-flip-chart onClick={() => expanded = !expanded}>
			Flip chart
		</button>
		@try {
			@if (expanded) {
				<kbd data-beacon-reading>{beacon}</kbd>
			} @else {
				<samp data-beacon-reading>{beacon}</samp>
			}
		} @pending {
			<meter data-beacon-wait>Calibrating</meter>
		} @catch {
			<del data-beacon-fault>Signal lost</del>
		}
	</section>
}
