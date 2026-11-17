import { state } from '@markless/core';

export function Switches() @{
	let open = state(false);
	let tab = state('first');
	let size = state(1);

	<section>
		<p>Open: {open}</p>
		<p>Tab {tab}, size {size}</p>
		<button onClick={() => (open = !open)}>Flip</button>
		<button onClick={() => { tab = 'second'; size = -2; }}>Second</button>
	</section>
}
