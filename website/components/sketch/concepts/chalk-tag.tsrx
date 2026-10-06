import { state } from '@markless/core';

export default function ChalkTag() @{
	let lit = state(false);

	<div class={lit ? 'card lit' : 'card'}>
		<style>
			.card {
				padding: 0.5em 0.8em;
				border: 2px dashed;
				background: darkslategray;
				color: white;
			}
			.lit {
				background: plum;
				color: black;
			}
		</style>
		Chalk card
		<button onClick={() => (lit = !lit)}>Light up</button>
	</div>
}
