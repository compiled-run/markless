import { state } from '@markless/core';

export default function App() @{
	let pressedAt = state('');
	let moved = state('not yet');
	const openedAt = new Date().toISOString();
	<main>
		<p>{`Opened in ${openedAt.slice(0, 2)}xx`}</p>
		<p>{`Opened ISO ${openedAt.length}`}</p>
		<p>{pressedAt === '' ? 'Not pressed' : `Pressed ISO ${pressedAt.length}`}</p>
		<p>{`Clock moved ${moved}`}</p>
		<button onClick={() => {
			const now = new Date().toISOString();
			moved = pressedAt === '' ? 'not yet' : now > pressedAt ? 'forward' : 'not forward';
			pressedAt = now;
		}}>Press</button>
	</main>
}
