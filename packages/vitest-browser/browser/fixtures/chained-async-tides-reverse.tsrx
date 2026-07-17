import { computed, state } from '@markless/core';

export function App() @{
	let harbor = state('north');
	const tideTable = computed(async ({ signal }) => {
		const port = harbor;
		await new Promise((resolve) => setTimeout(resolve, 20));
		if (signal.aborted) return { bearing: 'aborted' };
		return { bearing: port + '-east' };
	});
	const pilotPlan = computed(async ({ signal }) => {
		const bearing = tideTable.bearing;
		await new Promise((resolve) => setTimeout(resolve, 45));
		if (signal.aborted) return { passage: 'aborted' };
		return { passage: 'Passage ' + bearing };
	});

	<article>
		<button type="button" data-change-harbor onClick={() => harbor = 'south'}>
			Change harbor
		</button>
		<div data-passage-boundary>
			@try {
				<mark data-passage-arm>{pilotPlan.passage}</mark>
			} @pending {
				<mark data-passage-arm>Plotting</mark>
			} @catch {
				<mark data-passage-arm>Route lost</mark>
			}
		</div>
		<aside data-tide-boundary>
			@try {
				<i data-tide-arm>{tideTable.bearing}</i>
			} @pending {
				<i data-tide-arm>Measuring tide</i>
			} @catch {
				<i data-tide-arm>Tide unknown</i>
			}
		</aside>
	</article>
}
