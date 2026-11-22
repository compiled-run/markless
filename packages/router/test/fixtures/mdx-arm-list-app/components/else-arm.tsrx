import { state } from '@markless/core';

export default function ElseArm() @{
	let resting = state(true);

	<aside>
		@if (resting) {
			<p>Resting</p>
		} @else {
			let health = state(1000);

			<em data-count onClick={() => (health -= 150)}>{health}</em>
		}
		<i data-toggle onClick={() => (resting = !resting)}>Fight</i>
	</aside>
}
