import { state } from '@markless/core';

function linesOf(text: string): string[] {
	return text.split('\n');
}

export default function App() @{
	let text = state('Same line\nSame line\nLast line');
	<main>
		<h1>Lines</h1>
		@for (const line of linesOf(text); index i; key i) {
			<p>{line}</p>
		}
		<button onClick={() => (text = text + '\nAdded line')}>Add a line</button>
		<button onClick={() => (text = 'First changed' + text.slice(text.indexOf('\n')))}>
			Change the first
		</button>
		<button onClick={() => (text = text.slice(0, text.lastIndexOf('\n')))}>Drop the last</button>
	</main>
}
