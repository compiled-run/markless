import { state } from '@markless/core';

const frame = { position: 'absolute', top: 12, left: 40 };

export function App() @{
	let x = state(10);
	let y = state(20);
	const card = { color: 'rgb(0, 128, 0)', marginTop: 6 };
	const glide = { width: 100, height: 50, transform: `translate(${x}%, ${y}%)` };

	<section data-style-reference>
		<div data-local style={card}>Local</div>
		<div data-glide style={glide}>Glide</div>
		<button type="button" data-shift onClick={() => { x = 35; y = 60; }}>Shift</button>
		<div data-module style={frame}>Module</div>
	</section>
}
