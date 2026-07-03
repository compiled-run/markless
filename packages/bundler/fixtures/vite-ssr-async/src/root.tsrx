import { computed, state } from '@markless/core';

export function App() @{
	let query = state('Ada');
	const details = computed(async ({ signal }) => {
		const q = query;
		await new Promise((resolve) => setTimeout(resolve, 40));
		if (signal.aborted) return { title: 'aborted' };
		return { title: 'Hello ' + q };
	});

	<section>
		<button data-revalidate onClick={() => query = 'Grace'}>Revalidate</button>
		@try {
			<p class="done">{details.title}</p>
		} @pending {
			<p class="pending">Loading</p>
		} @catch {
			<p class="broken">Broken</p>
		}
	</section>
}
