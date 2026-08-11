import { state } from '@markless/core';

export function App() @{
	let x = state(10);
	let y = state(20);
	let hue = state('rgb(255, 0, 0)');
	let gap = state(8);

	<section data-style-dynamic>
		<div data-mover style={{ width: 100, height: 50, transform: `translate(${x}%, ${y}%)` }}>Mover</div>
		<button type="button" data-shift onClick={() => { x = 35; y = 60; }}>Shift</button>

		<p data-tinted style={{ color: hue }}>Tinted</p>
		<button type="button" data-clear-color onClick={() => hue = null}>Clear color</button>

		<div data-spaced style={{ marginTop: gap }}>Spaced</div>
		<button type="button" data-clear-gap onClick={() => gap = undefined}>Clear gap</button>
	</section>
}
