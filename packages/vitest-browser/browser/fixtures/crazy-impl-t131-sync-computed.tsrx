import { computed, state } from '@markless/core';

export function App() @{
	let count = state(2);
	const doubled = computed(() => count * 2);

	<section data-t131-sync-computed>
		<button type="button" data-t131-increment onClick={() => count++}>Increment</button>
		<output data-t131-doubled>{doubled}</output>
	</section>
}
