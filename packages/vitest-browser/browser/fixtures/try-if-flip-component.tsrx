import { computed, state } from '@markless/core';

function Badge({ caption }) @{
	let taps = state(0);
	const shown = computed(() => `${caption}-${taps}`);

	<span data-badge onClick={() => taps = taps + 1}>{shown}</span>
}

export function App() @{
	let open = state(false);
	const report = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 10));
		return { title: 'Report ready' };
	});

	<div>
		<button type="button" data-toggle onClick={() => open = !open}>Toggle</button>
		@try {
			<p data-report-title>{report.title}</p>
			@if (open) { <Badge caption="badge" /> }
		} @pending {
			<p data-report-wait>Loading</p>
		}
	</div>
}
