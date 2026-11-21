import { state } from '@markless/core';

export default function MouseFields() @{
	let x = state(0);
	let buttons = state(-1);
	let moves = state(0);
	<main>
		<p onMousedown={(event) => { x = event.clientX; buttons = event.buttons; }} onMousemove={() => moves++}>Press</p>
		<p onMouseup={(event) => (buttons = event.buttons)}>Lift</p>
		<p>{x} {buttons} {moves}</p>
	</main>
}
