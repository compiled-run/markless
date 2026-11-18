import { state } from '@markless/core';

function later(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function lookup(word: string): Promise<string> {
	await later(2000);
	if (word === 'missing') throw new Error(`No entry for ${word}`);
	return word.toUpperCase();
}

export default function App() @{
	let result = state('none');
	let steps = state(0);
	<main>
		<h1>Lookup</h1>
		@try {
			<div>
				<p>Result: {result}</p>
				<p>Steps: {steps}</p>
			<button
				onClick={async () => {
					steps++;
					result = await lookup('found');
					steps++;
				}}
			>
				Look up
			</button>
			<button
				onClick={async () => {
					steps++;
					result = await lookup('missing');
					steps++;
				}}
			>
				Look up a missing word
			</button>
			</div>
		} @catch (error) {
			<p>Failed: {error.message}</p>
		}
	</main>
}
