import { computed, state } from '@markless/core';
import { ReportBadge } from './report-badge.tsrx';

// T103 commitArm repro (b): a settled composed arm re-renders when a state
// the async computed reads changes. The re-committed arm's button must fire,
// and the input OUTSIDE the boundary must keep focus and value across the
// range replacement.
export function App() @{
	let query = state('alpha');
	let picked = state('none');
	const report = computed(async ({ signal }) => {
		const q = query;
		await new Promise((resolve) => setTimeout(resolve, 20));
		if (signal.aborted) return { title: 'aborted' };
		return { title: 'Report ' + q };
	});

	<main>
		<input type="text" data-note />
		<button type="button" data-refresh onClick={() => query = 'beta'}>Refresh</button>
		<output data-picked>{picked}</output>
		@try {
			<>
				<ReportBadge label={report.title} />
				<button type="button" data-pick onClick={() => picked = 'picked:' + report.title}>Pick</button>
			</>
		} @pending {
			<p class="pending">Loading</p>
		} @catch {
			<p class="broken">Broken</p>
		}
	</main>
}
