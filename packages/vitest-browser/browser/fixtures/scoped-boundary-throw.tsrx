import { computed, state } from '@markless/core';

export function App() @{
	const details = computed(async () => {
		throw new Error('boundary fetch exploded');
	});
	let taps = state(0);

	<main>
		<button type="button" data-boundary-sibling onClick={() => taps++}>{taps}</button>
		@try {
			<p data-boundary-value>{details.title}</p>
		} @pending {
			<p data-boundary-pending>loading</p>
		} @catch {
			<p data-boundary-catch>contained boundary error</p>
		}
	</main>
}
