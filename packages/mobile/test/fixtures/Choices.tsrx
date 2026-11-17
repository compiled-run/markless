import { state } from '@markless/core';

export function Choices() @{
	let n = state(0);
	let tab = state('a');
	<div>
		<button onClick={() => n++}>Next</button>
		<button onClick={() => (tab = tab === 'a' ? 'b' : tab === 'b' ? 'z' : 'a')}>Tab</button>
		@if (n === 1) {
			<p>one</p>
		} @else if (n === 2) {
			<p>two</p>
		} @else if (n < 1) {
			<p>none yet</p>
		}
		@switch (tab) {
			@default: {
				<p>other</p>
			}
			@case 'a': {
				<p>first</p>
			}
			@case 'b': {
				<p>second</p>
			}
		}
	</div>
}
