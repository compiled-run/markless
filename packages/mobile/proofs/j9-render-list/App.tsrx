import { state } from '@markless/core';
import { byLength } from '../lib/names.ts';

export default function App() @{
	let words = state(['kiwi', 'fig', 'banana']);
	<main>
		<h1>Shortest first</h1>
		<ul>
			@for (const word of byLength(words); key word) {
				<li>{word}</li>
			}
		</ul>
		<button onClick={() => (words = [...words, 'date'])}>Add date</button>
	</main>
}
