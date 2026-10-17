import { state } from '@markless/core';

export function App() @{
	let mode = state('beta');
	let taps = state(0);

	<main>
		@if (mode === 'alpha') {
			<p>alpha</p>
		} @else {
			<div class="panel">
				<span>label</span>
				<button type="button" data-else onClick={() => taps++}>else</button>
			</div>
		}
		@switch (mode) {
			@case 'alpha': { <p>first</p> }
			@case 'beta': { <article><button type="button" data-case onClick={() => (taps = taps + 10)}>case</button></article> }
			@default: { <p>other</p> }
		}
		<output data-taps>{taps}</output>
	</main>
}
