import { state } from '@markless/core';

export default function App() @{
	let fruits = state(['Fig', 'Kiwi', 'Lime']);
	<main>
		<h1>Ranked</h1>
		@for (const fruit of fruits; index i; key fruit) {
			<p>{`${i + 1}. ${fruit}`}</p>
		}
		<button onClick={() => (fruits = [...fruits].reverse())}>Reverse</button>
		<button onClick={() => (fruits = fruits.slice(1))}>Drop the first</button>
	</main>
}
