import { state } from '@markless/core';

export default function ChalkCard() @{
	let lit = state(false);

	<article class={lit ? 'card lit' : 'card'}>
		<style>
			.card {
				padding: 0.6em 0.9em;
				border: 2px dashed currentColor;
				background: darkslategray;
				color: white;
			}
			.lit {
				background: plum;
				color: black;
			}
		</style>
		<p>Chalk card</p>
		<button onClick={() => (lit = !lit)}>Light it up</button>
	</article>
}
