import { state } from '@markless/core';

// A surface served open beside one focusable control that carries a record of
// its own. Focus arriving on that control is enough to start the wake, so an
// Escape pressed in the same task lands in the window between the wake starting
// and the overlay behaviour installing.
export default function EscapeDuringWakePage() @{
	let isOpen = state(true);
	let presses = state(0);
	let dismissals = state(0);

	<section data-page>
		<button
			type="button"
			data-waker
			onClick={() => {
				presses = presses + 1;
			}}
		>Wake</button>
		<output data-presses>{presses}</output>

		<div
			data-surface
			overlay
			role="dialog"
			hidden={isOpen !== true}
			onDismiss={(event) => {
				dismissals = dismissals + 1;
				if (event.detail.reason === 'escape') isOpen = false;
			}}
		>
			<output data-dismissals>{dismissals}</output>
		</div>
	</section>
}
