import { computed, state } from '@markless/core';

export function App() @{
	let query = state('alpha');
	const packet = computed(async () => ({ title: query }));
	const derived = computed(() => {
		const title = packet.title;
		throw new Error('derived incident exploded for ' + title);
	});

	<main>
		<button type="button" data-derived-retry onClick={() => query = 'beta'}>Retry</button>
		@try {
			<p data-derived-value>{derived}</p>
		} @pending {
			<p data-derived-pending>loading incident</p>
		} @catch {
			<p data-derived-catch>contained derived error</p>
		}
	</main>
}
