import { computed, state } from '@markless/core';

export function App() @{
	let cheers = state(0);
	let tide = state('low');
	const harbor = computed(async ({ signal }) => {
		const level = tide;
		await new Promise((resolve) => setTimeout(resolve, 20));
		if (signal.aborted) return { title: 'aborted' };
		return { title: 'Harbor ' + level };
	});

	<main>
		<button type="button" data-tide onClick={() => tide = 'high'}>Tide</button>
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
