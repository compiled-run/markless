import { computed, state } from '@markless/core';
import { lookUp } from '../lib/words.ts';

export default function App() @{
	let word = state('missing');
	let tries = state(0);
	const entry = computed(async ({ signal }) => lookUp(word, signal));
	<main>
		<h1>Retry</h1>
		<p>Tries: {tries}</p>
		<p>Asked: {word}</p>
		<button onClick={() => (word = 'apple')}>Ask apple</button>
		@try {
			<p>Word: {entry.word}</p>
		} @pending {
			<p>Looking up</p>
		} @catch (error, reset) {
			<div>
				<p>Failed: {error.message}</p>
				<button
					onClick={() => {
						tries++;
						reset();
					}}
				>
					Try again
				</button>
				<button onClick={reset}>Retry</button>
			</div>
		}
	</main>
}
