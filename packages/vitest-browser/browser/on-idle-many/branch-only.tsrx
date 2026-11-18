import { state } from '@markless/core';

export default function BranchOnly() @{
	let shown = state(true);
	<section>
		@if (shown) {
			<p>Shown</p>
		}
		<button onClick={() => (shown = !shown)}>Flip</button>
	</section>
}
