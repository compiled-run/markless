import { computed, state } from '@markless/core';
import { ReportBadge } from './report-badge.tsrx';

// A 350 ms refresh: past the navigation deadline, far under the re-settle stall threshold.
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
