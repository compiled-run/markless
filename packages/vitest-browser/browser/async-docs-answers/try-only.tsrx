import { computed, state } from '@markless/core';

export default function TryOnly() @{
	let fail = state(true);
	const report = computed(async () => {
		const failing = fail;
		await new Promise((resolve) => setTimeout(resolve, 5));
		if (failing) throw new Error('down');
		return { total: 42 };
	});

	<main>
		<h1 data-heading>Report</h1>
		<button type="button" data-retry onClick={() => (fail = false)}>Retry</button>
		<div data-boundary>
			@try {
				<p data-total>{report.total}</p>
			} @pending {
				<p data-pending>Loading</p>
			}
		</div>
	</main>
}
