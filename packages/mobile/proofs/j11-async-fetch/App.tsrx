import { computed, state } from '@markless/core';
import { lookUp } from '../lib/words.ts';

export default function App() @{
	let word = state('apple');
	const entry = computed(async ({ signal }) => lookUp(word, signal));
	<main>
		<h1>Dictionary</h1>
		<p>Asked: {word}</p>
		<button onClick={() => (word = 'banana')}>Banana</button>
		<button onClick={() => (word = 'cherry')}>Cherry</button>
		<button onClick={() => (word = 'missing')}>Missing</button>
		@try {
			<div>
				<p>Word: {entry.word}</p>
				<p>Echo: {entry.echo}</p>
			</div>
		} @pending {
			<p>Looking up</p>
		} @catch (error) {
			<p>Failed: {error.message}</p>
		}
	</main>
}
