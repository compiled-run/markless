import { state } from '@markless/core';

export default function App() @{
	let idles = state(0);
	let more = state(false);
	let moreIdle = state('waiting');
	<main>
		<p onIdle={() => idles++}>{`Idle ${idles}`}</p>
		<button onClick={() => (more = !more)}>More</button>
		@if (more) {
			<p onIdle={() => (moreIdle = moreIdle === 'waiting' ? 'idle once' : 'idle again')}>{`More ${moreIdle}`}</p>
		}
	</main>
}
