import { computed, state } from '@markless/core';
import { lookUp } from '../lib/words.ts';

function Entry({ word }: { word: string }) @{
	const entry = computed(async ({ signal }) => lookUp(word, signal));
	@try {
		<li>Echo of {word}: {entry.echo}</li>
	} @pending {
		<li>Looking up {word}</li>
	} @catch (error) {
		<li>{error.message}</li>
	}
}

export default function App() @{
	let words = state<string[]>(['apple', 'missing']);
	<main>
		<h1>Rows</h1>
		<p>Words: {words.length}</p>
		<button onClick={() => (words = ['apple', 'missing', 'cherry'])}>Add cherry</button>
		<button onClick={() => (words = ['apple'])}>Only apple</button>
		<ul>
			@for (const word of words; key word) {
				<Entry word={word} />
			}
		</ul>
	</main>
}
