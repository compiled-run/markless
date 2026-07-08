import { computed, state } from '@markless/core';
import { ReportBadge } from './report-badge.tsrx';

// T103 commitArm repro (a): a composed @try arm (imported component + button)
// on a CSR-mounted page. The boundary settles through the tier-4 arm-render
// module, so the settled DOM is only interactive if commitArm re-registers
// the arm-relative records against the fresh range.
export function App() @{
	let saved = state('none');
	const report = computed(async ({ signal }) => {
		await new Promise((resolve) => setTimeout(resolve, 20));
		if (signal.aborted) return { title: 'aborted' };
		return { title: 'Q3 report' };
	});

	<main>
		<output data-saved>{saved}</output>
		@try {
			<>
				<ReportBadge label={report.title} />
				<button type="button" data-save onClick={() => saved = 'saved:' + report.title}>Save</button>
			</>
		} @pending {
			<p class="pending">Loading</p>
		} @catch {
			<p class="broken">Broken</p>
		}
	</main>
}
