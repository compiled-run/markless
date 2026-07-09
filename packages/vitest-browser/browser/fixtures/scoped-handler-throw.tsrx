import { state } from '@markless/core';

export function App() @{
	let taps = state(0);

	<main>
		<button type="button" data-throws onClick={() => {
			throw new Error('handler rail exploded');
		}}>Throw</button>
		<button type="button" data-still-live onClick={() => taps++}>{taps}</button>
	</main>
}
