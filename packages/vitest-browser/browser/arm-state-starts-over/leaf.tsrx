import { state } from '@markless/core';

export default function Leaf() @{
	let shown = state(false);

	<p>
		<i data-toggle onClick={() => (shown = !shown)}>Leaf</i>
		@if (shown) {
			let coins = state(5);

			<b data-count onClick={() => (coins += 5)}>{coins}</b>
		}
	</p>
}
