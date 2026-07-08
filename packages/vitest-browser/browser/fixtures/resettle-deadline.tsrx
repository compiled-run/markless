import { computed, state } from '@markless/core';
import { ReportBadge } from './report-badge.tsrx';

// T120 deadline-gated @pending on re-settles: this refresh is SLOW (well past
// the 250ms client deadline), so after holding the prior settled content the
// boundary must commit its @pending arm, keep it visible at least the pending
// minimum, then commit the fresh settled content.
export function App() @{
	let query = state('alpha');
	const report = computed(async ({ signal }) => {
		const q = query;
		await new Promise((resolve) => setTimeout(resolve, 350));
		if (signal.aborted) return { title: 'aborted' };
		return { title: 'Report ' + q };
	});

	<main>
		<button type="button" data-refresh onClick={() => query = 'beta'}>Refresh</button>
		@try {
			<>
				<ReportBadge label={report.title} />
			</>
		} @pending {
			<p class="pending">Loading</p>
		} @catch {
			<p class="broken">Broken</p>
		}
	</main>
}
