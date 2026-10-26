import { computed, state } from '@markless/core';

export function App() @{
	let page = state(1);
	const listing = computed(async ({ signal }) => {
		const at = page;
		await new Promise((resolve) => setTimeout(resolve, 600));
		if (signal.aborted) return { label: 'aborted' };
		return { label: 'Page ' + at };
	});

	<main>
		<button type="button" data-next onClick={() => (page = page + 1)}>Next</button>
		<nav data-boundary>
			@try {
				<h2 data-label>{listing.label}</h2>
			} @pending {
				<p data-pending>Loading</p>
			} @catch {
				<p data-failed>Broken</p>
			}
		</nav>
	</main>
}
