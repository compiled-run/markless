import { computed, element, state } from '@markless/core';

type Gate = { __harborGate?: Promise<unknown> };

export function App() @{
	let bumps = state(0);
	let cheers = state(0);
	let tide = state('open');
	const bumpEl = element();
	const harbor = computed(async () => {
		const level = tide;
		await ((globalThis as Gate).__harborGate ??
			new Promise((resolve) => setTimeout(resolve, 300)));
		return { title: 'Harbor ' + level };
	});

	<main>
		<button el={bumpEl} data-bump onClick={() => bumps++}>Bump</button>
		<button data-tide onClick={() => tide = 'busy'}>Tide</button>
		<output>{bumps}</output>
		<span data-cheers>{cheers}</span>
		@try {
			<section class="settled">
				<button data-cheer onClick={() => cheers++}>{harbor.title}</button>
				<em data-arm-cheers>{cheers}</em>
			</section>
		} @pending {
			<p class="waiting">Checking tides</p>
		} @catch {
			<p class="closed">Closed</p>
		}
	</main>
}
