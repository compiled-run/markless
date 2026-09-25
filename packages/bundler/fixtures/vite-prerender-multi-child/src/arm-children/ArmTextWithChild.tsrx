import { computed, state } from '@markless/core';

function Chip() @{
	let hits = state(0);
	const twice = computed(() => hits * 2);

	<i data-own onClick={() => hits = hits + 1}>chip {hits}/{twice}</i>
}

export function App() @{
	let open = state(false);
	let taps = state(0);
	const doubled = computed(() => taps * 2);

	<main data-multi-child>
		<button type="button" data-open onClick={() => open = !open}>Open</button>
		<button type="button" data-tap onClick={() => taps = taps + 1}>Tap</button>
		@if (open) {
			<Chip />
			<span data-chip>chip {taps}/{doubled}</span>
		}
	</main>
}
