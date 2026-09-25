import { computed, state } from '@markless/core';

function Chip() @{
	let hits = state(0);

	<i data-own onClick={() => hits = hits + 1}>own {hits}</i>
}

export default function TextInEscalatedArm() @{
	let open = state(false);
	let taps = state(0);
	const doubled = computed(() => taps * 2);

	<main>
		<button type="button" data-open onClick={() => open = !open}>Open</button>
		<button type="button" data-tap onClick={() => taps = taps + 1}>Tap</button>
		@if (open) {
			<Chip />
			<span data-one>{taps}</span>
			<span data-two>chip {taps}/{doubled}</span>
			<button type="button" data-inner onClick={() => taps = taps + 10}>Inner</button>
		}
	</main>
}
