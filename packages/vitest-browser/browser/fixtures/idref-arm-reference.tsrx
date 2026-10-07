import { element, state } from '@markless/core';
// The element is always rendered; only the reference naming it arrives with the arm.
export default function IdrefArmReference() @{
	let shown = state(false);
	const sheet = element<HTMLElement>();
	<div>
		<p data-arm-sheet el={sheet}>Body</p>
		<button type="button" data-arm-trigger onClick={() => (shown = !shown)}>Details</button>
		@if (shown) {
			<h2 data-arm-ref aria-describedby={sheet}>Head</h2>
		}
	</div>
}
