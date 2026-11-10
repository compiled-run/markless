import { computed, state } from '@markless/core';
import { getReport } from './gate.ts';

export default function ReportThree() @{
	let days = state(7);
	const summary = computed(async () => ({ days, total: (await getReport(days)).total }));

	<div>
		<button data-more onClick={() => (days = 30)}>30 days</button>
		@try {
			<>
				<h3 data-report>{summary.total} in {summary.days} days ({summary.total} total)</h3>
				<span data-days>{summary.days}</span>
			</>
		} @pending {
			<p data-loading>Loading…</p>
		}
	</div>
}
