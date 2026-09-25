import { computed, state } from '@markless/core';

export function App() @{
	let cheers = state(0);
	const harbor = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 1));
		return { title: 'Harbor open' };
	});

	<main>
		<span data-outside>{cheers}</span>
		@try {
			<section>
				<button type="button" data-cheer onClick={() => cheers++}>{harbor.title}</button>
				<em data-arm-cheers>{cheers}</em>
			</section>
		} @pending {
			<p data-waiting>Checking tides</p>
		} @catch {
			<p>Closed</p>
		}
	</main>
}
