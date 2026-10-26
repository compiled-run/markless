import { computed, state } from '@markless/core';

export function App() @{
	let query = state('start');
	const report = computed(async ({ signal }) => {
		const q = query;
		await new Promise((resolve) => setTimeout(resolve, q === 'start' ? 10 : 7_000));
		if (signal.aborted) return { title: 'aborted', key: 'aborted' };
		return { title: 'Report ' + q, key: q };
	});

	<main>
		<button type="button" data-first onClick={() => (query = 'first')}>First</button>
		<button type="button" data-second onClick={() => (query = 'second')}>Second</button>
		<article data-boundary>
			@try {
				<p data-content data-for={report.key}>{report.title}</p>
			} @pending {
				<p data-pending>Loading</p>
			} @catch {
				<p data-failed>Broken</p>
			}
		</article>
	</main>
}
