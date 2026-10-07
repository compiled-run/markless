import { element, state } from '@markless/core';

// The handle is declared beside the trigger and bound only inside the arm, so
// the reference outside the arm is the one position naming it on first render.
export default function IdrefArmPanel() @{
	let shown = state(false);
	const sheet = element<HTMLElement>();
	<div data-idref-arm>
		<button type="button" data-arm-trigger aria-controls={sheet} onClick={() => (shown = !shown)}>
			Details
		</button>
		@if (shown) {
			<aside data-arm-sheet el={sheet}>Shipping in two days</aside>
		}
	</div>
}
