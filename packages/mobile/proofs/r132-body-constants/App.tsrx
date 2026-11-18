import { state } from '@markless/core';

export default function App() @{
	let count = state(1);
	const doubled = count * 2;
	const label = 'Count';
	<main>
		<h1>{label}</h1>
		<p>{doubled}</p>
		<p>{`Now ${doubled}`}</p>
		<button onClick={() => (count = doubled + 1)}>Grow</button>
	</main>
}
