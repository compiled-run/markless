import { state } from '@markless/core';

export default function App() @{
	let lines = state(1);
	<main>
		<h1>Preformatted</h1>
		<pre>{'let a = 1;\n  let b = 2;'}</pre>
		<pre>{'lines: ' + lines}</pre>
		<button onClick={() => lines++}>Add line</button>
	</main>
}
