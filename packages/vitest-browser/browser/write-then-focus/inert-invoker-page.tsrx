import { element, state } from '@markless/core';

// A handler clears `inert` off an invoker and focuses it on the next line. An
// inert element refuses focus, so this is the closing half of the overlay
// handoff: the same write-then-focus shape with a different blocker.
export default function WriteThenFocusInertInvokerPage() @{
	let locked = state(true);
	const invokerEl = element<HTMLButtonElement>();

	<section data-write-then-focus="inert">
		<button
			type="button"
			data-testid="unlock"
			onClick={() => {
				locked = false;
				invokerEl?.focus();
			}}
		>unlock</button>
		<button type="button" data-testid="invoker" el={invokerEl} inert={locked}>invoker</button>
	</section>
}
