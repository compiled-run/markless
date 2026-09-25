import { computed, state } from '@markless/core';

function Chip() @{
	let hits = state(0);
	const twice = computed(() => hits * 2);

	<i data-own onClick={() => hits = hits + 1}>chip {hits}/{twice}</i>
}

export function App() @{
	let open = state(false);

	<main data-multi-child>
		<button type="button" data-open onClick={() => open = !open}>Open</button>
		@if (open) { <Chip /> }
	</main>
}
