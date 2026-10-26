import { computed, state } from '@markless/core';

export function App() @{
	let query = state('alpha');
	const report = computed(async ({ signal }) => {
		const q = query;
		await new Promise((resolve) => setTimeout(resolve, q === 'alpha' ? 10 : 900));
		if (signal.aborted) return { title: 'aborted', key: 'aborted' };
		return { title: 'Report ' + q, key: q };
	});

	<main>
		<button type="button" data-refresh onClick={() => (query = 'beta')}>Refresh</button>
		<section data-boundary>
			@try {
				<p data-content data-for={report.key}>{report.title}</p>
			} @pending {
				<p data-pending>Loading</p>
			} @catch {
				<p data-failed>Broken</p>
			}
		</section>
	</main>
}
