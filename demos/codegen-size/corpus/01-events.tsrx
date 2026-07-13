import { state } from '@markless/core';
export function Events() @{
	let count = state(0);
	<section><button onClick={() => count++}>Increment</button><button onKeyDown={(event) => { if (event.key === 'Escape') count = 0; }}>Reset</button><output>{count}</output></section>
}
