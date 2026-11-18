import { computed, state } from '@markless/core';

function Badge({ tone }: { readonly tone: string }) @{
	let taps = state(0);
	const caption = computed(() => `${tone || 'none'} ${taps}`);
	<b data-badge onClick={() => taps++}>{caption}</b>
}

// Hands `label` on to a child, and also shows it in an arm and reads it in a handler.
export function Relay({ label }: { readonly label: string }) @{
	let seen = state('nothing');
	<section>
		@if (label) {
			<p data-arm>shown {label}</p>
		} @else {
			<p data-empty>empty</p>
		}
		<button data-read onClick={() => (seen = label || 'blank')}>Read</button>
		<output data-seen>{seen}</output>
		<Badge tone={label} />
	</section>
}
