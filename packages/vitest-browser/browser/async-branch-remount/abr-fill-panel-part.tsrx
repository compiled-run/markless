import { computed, state } from '@markless/core';

function Tally() @{
	let hits = state(0);
	const label = computed(() => `${hits} hits`);
	<button type="button" data-tally onClick={() => hits = hits + 1}>{label}</button>
}

export default function FillPanel({ fill }: { readonly fill: string }) @{
	let shown = state(false);
	<section>
		<button type="button" data-show onClick={() => shown = !shown}>Show</button>
		@if (shown) {
			<div data-filled data-fill={fill}><Tally /></div>
		}
	</section>
}
