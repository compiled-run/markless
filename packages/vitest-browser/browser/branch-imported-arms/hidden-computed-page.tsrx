import { computed, state } from '@markless/core';
import { describeScene } from './scene-lib.ts';

export function HiddenComputedPage() @{
	let shown = state(false);
	let seed = state(3);
	const scene = computed(() => describeScene(seed));

	<main>
		<button type="button" data-toggle onClick={() => (shown = !shown)}>Toggle</button>
		<button type="button" data-seed onClick={() => (seed = seed + 1)}>Seed</button>
		<output data-seed-value>{seed}</output>
		@if (shown) {
			<p data-scene>{scene}</p>
		}
	</main>
}
