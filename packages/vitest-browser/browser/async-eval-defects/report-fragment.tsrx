import { computed, state } from '@markless/core';
import { getReport } from './gate.ts';

export default function ReportFragment() @{
	let days = state(7);
	const report = computed(async () => ({ days, total: (await getReport(days)).total }));

	<main>
		<button data-more onClick={() => (days = 30)}>30 days</button>
		@try {
			<>
				<p data-report>Total: {report.total} over {report.days} days</p>
				<button data-save>Save</button>
			</>
		} @pending {
			<p data-loading>Loading…</p>
		}
	</main>
}
