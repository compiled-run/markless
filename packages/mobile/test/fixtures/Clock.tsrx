import { state } from '@markless/core';

export default function Clock() @{
	let pressedAt = state('never');
	let since = state(Date.now());
	const openedAt = new Date().toISOString();
	<main>
		<p>{`Opened ${openedAt}`}</p>
		<p>{`Since 1970 ${Date.now() > 0}`}</p>
		<p>{`Pressed ${pressedAt}`}</p>
		<p>{`Started ${since}`}</p>
		<button onClick={() => {
			pressedAt = new Date().toISOString();
			since = Date.now() + 1;
		}}>Press</button>
	</main>
}
