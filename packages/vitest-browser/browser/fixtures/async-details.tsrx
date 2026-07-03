import { computed, state } from '@markless/core';

export function App() @{
	const query = state('Ada');
	const details = computed(async ({ signal }) => {
		const q = query;
		await new Promise((resolve) => setTimeout(resolve, 40));
		if (signal.aborted) return { title: 'aborted' };
		return { title: 'Hello ' + q };
	});

	<section>
		@try {
			<p class="done">{details.title}</p>
		} @pending {
			<p class="pending">Loading</p>
		} @catch (error) {
			<p class="broken">{error.message}</p>
		}
	</section>
}
