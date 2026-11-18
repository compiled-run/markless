import { computed, state } from '@markless/core';
import { getReport, save } from './gate.ts';

export default function ReportNamed() @{
	let days = state(7);
	let saving = state(false);
	const report = computed(async () => {
		const span = days;
		const data = await getReport(span);
		return { days: span, total: data.total };
	});

	const keep = async () => {
		saving = true;
		try {
			await Promise.resolve(save({ days: report.days, total: report.total }));
		} finally {
			saving = false;
		}
	};

	function share() {
		const shown = report;
		save(`${shown.total}/${shown.days}`);
	}

	<main>
		@try {
			<>
				<p data-report>Total: {report.total} over {report.days} days</p>
				<button data-save disabled={saving} onClick={keep}>Save</button>
				<button data-share onClick={share}>Share</button>
			</>
		} @pending {
			<p data-loading>Loading…</p>
		}
	</main>
}
