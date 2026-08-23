import { state } from '@markless/core';

// The two shapes that serve identically and must behave oppositely.
//
// `data-served-open` has a `hidden` binding that is currently false, so it is
// open BECAUSE the binding says so and belongs on the stack from the first
// paint. `data-inline-shown` has no `hidden` binding at all - the inline shape -
// and must stay off the stack no matter what it looks like.
//
// In the served HTML neither carries `hidden`. They sit on their own page rather
// than in the main overlay fixture because an element enlisted at startup is
// topmost for the whole page, and every other row there reads the top of the
// stack.
export default function OverlayServedOpenPage() @{
	let outside = state(0);
	let isServedOpen = state(true);
	let servedDismissals = state(0);
	let servedReason = state('none');
	let inlineDismissals = state(0);

	<section data-served-page>
		<button
			type="button"
			data-outside
			onClick={() => {
				outside = outside + 1;
			}}
		>Outside</button>
		<output data-outside-count>{outside}</output>

		<div
			data-served-open
			overlay
			role="dialog"
			aria-modal="true"
			hidden={isServedOpen !== true}
			onDismiss={(event) => {
				servedReason = event.detail.reason;
				servedDismissals = servedDismissals + 1;
				if (event.detail.reason === 'escape') isServedOpen = false;
			}}
		>
			<output data-served-dismissals>{servedDismissals}</output>
			<output data-served-reason>{servedReason}</output>
		</div>

		<div
			data-inline-shown
			overlay
			onDismiss={() => {
				inlineDismissals = inlineDismissals + 1;
			}}
		>
			<output data-inline-dismissals>{inlineDismissals}</output>
		</div>
	</section>
}
