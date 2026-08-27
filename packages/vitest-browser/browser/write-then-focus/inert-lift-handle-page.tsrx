import { element, state } from '@markless/core';

// The same close, with the returned-to element reached through an `element()`
// handle instead of the behaviour's captured reading. The blocker is identical:
// the overlay marked the background `inert`, and that mark comes off after the
// hide commits, not with it.

export default function WriteThenFocusInertLiftHandlePage() @{
	let open = state(false);
	const originEl = element<HTMLButtonElement>();

	<section data-write-then-focus="inert-lift-handle">
		<button
			type="button"
			data-testid="origin"
			el={originEl}
			onClick={() => {
				open = true;
			}}
		>origin</button>
		<div data-testid="surface" overlay role="dialog" aria-modal="true" hidden={open !== true}>
			<button
				type="button"
				data-testid="close"
				onClick={() => {
					open = false;
					originEl?.focus();
				}}
			>close</button>
		</div>
	</section>
}
