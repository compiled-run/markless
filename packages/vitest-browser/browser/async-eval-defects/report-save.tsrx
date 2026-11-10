import { computed, state } from '@markless/core';
import { getReport, save } from './gate.ts';

export default function ReportSave() @{
	let days = state(7);
	const report = computed(async () => ({ days, total: (await getReport(days)).total }));

	<main>
		@try {
			<section>
				<p data-report>{report.total}</p>
				<button
					data-save
					onClick={() => {
						const shown = report;
						save(shown.days);
					}}
				>
					Save
				</button>
				<button
					data-share
					onClick={() => {
						const { total, days: span } = report;
						save(`${total}/${span}`);
					}}
				>
					Share
				</button>
			</section>
		} @pending {
			<p data-loading>Loading…</p>
		}
	</main>
}
