import { state } from '@markless/core';

export default function App() @{
	let count = state(0);
	<main>
		<h1>Counter</h1>
		<button onClick={() => count++}>Count {count}</button>
	</main>
}
