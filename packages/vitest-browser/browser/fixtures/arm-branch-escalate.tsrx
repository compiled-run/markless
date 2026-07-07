import { computed, state } from '@markless/core';
import { ReportBadge } from './report-badge.tsrx';

// T104 escalation proof (D2): the @if content contains a component, so a
// branch flip cannot rebuild it. The toggle must still WORK by re-rendering
// the whole @try content through the boundary's arm-render module (the
// compiler diagnoses the cost in author words; see arm-branch-flips.test.ts).
export function App() @{
	let detailsOpen = state(false);
	const report = computed(async ({ signal }) => {
		await new Promise((resolve) => setTimeout(resolve, 10));
		if (signal.aborted) return { title: 'aborted' };
		return { title: 'Q3 report' };
	});

	<main>
		@try {
			<div class="stack">
				<button type="button" data-details-toggle onClick={() => detailsOpen = !detailsOpen}>Details</button>
				@if (detailsOpen) {
					<ReportBadge label={report.title} />
				}
			</div>
		} @pending {
			<p class="pending">Loading</p>
		} @catch {
			<p class="broken">Broken</p>
		}
	</main>
}
