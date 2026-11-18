import { state } from '@markless/core';

export default function Clock() @{
	let pressedAt = state('never');
	const openedAt = new Date().toISOString();
	<main>
		<p>{`Opened ${openedAt}`}</p>
		<p>{`Since 1970 ${Date.now() > 0}`}</p>
		<p>{`Pressed ${pressedAt}`}</p>
		<button onClick={() => (pressedAt = new Date().toISOString())}>Press</button>
	</main>
}
