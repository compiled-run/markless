import { computed, state } from '@markless/core';

function Chip() @{
	let hits = state(0);
	const twice = computed(() => hits * 2);

	<i data-own onClick={() => hits = hits + 1}>chip {hits}/{twice}</i>
}

export default function TextHolesInArm() @{
	let open = state(true);
	let taps = state(0);
	const doubled = computed(() => taps * 2);

	<main>
		<button type="button" data-open onClick={() => open = !open}>Open</button>
		<button type="button" data-tap onClick={() => taps = taps + 1}>Tap</button>
		<span data-flat>chip {taps}/{doubled}</span>
		<p data-mixed>{taps} and {doubled}<b data-mark>!</b></p>
		@if (open) {
			<span data-chip>chip {taps}/{doubled}</span>
		}
		@if (open) {
			<Chip />
		}
	</main>
}
