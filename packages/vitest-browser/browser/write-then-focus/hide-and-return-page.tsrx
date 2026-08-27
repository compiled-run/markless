import { element, state } from '@markless/core';

// Closing: focus is inside the surface, the handler hides the surface and
// hands focus back to the trigger. Hiding the subtree focus lives in blurs it,
// and that blur arrives with the commit - so the returned focus has to be
// landed after the commit, not before it, or the page ends up on the body.
export default function WriteThenFocusHideAndReturnPage() @{
	let open = state(true);
	const triggerEl = element<HTMLButtonElement>();
	const closeEl = element<HTMLButtonElement>();

	<section data-write-then-focus="return">
		<button type="button" data-testid="trigger" el={triggerEl} onClick={() => (open = true)}>
			trigger
		</button>
		<div data-testid="surface" hidden={open !== true}>
			<button
				type="button"
				data-testid="close"
				el={closeEl}
				onClick={() => {
					open = false;
					triggerEl?.focus();
				}}
			>close</button>
		</div>
	</section>
}
