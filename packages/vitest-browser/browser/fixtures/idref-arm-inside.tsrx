import { element, state } from '@markless/core';
// The reference and the element it names arrive together in one arm.
export default function IdrefArmInside() @{
	let shown = state(false);
	const sheet = element<HTMLElement>();
	<div>
		<button type="button" data-arm-trigger onClick={() => (shown = !shown)}>Details</button>
		@if (shown) {
			<section>
				<h2 data-arm-ref aria-describedby={sheet}>Head</h2>
				<p data-arm-sheet el={sheet}>Body</p>
			</section>
		}
	</div>
}
