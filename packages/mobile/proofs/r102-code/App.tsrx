import { state } from '@markless/core';

export default function App() @{
	let shortcut = state('Ctrl');
	<main>
		<h1>Code</h1>
		<p>Call <code>state()</code> to keep a value</p>
		<p>Press <kbd>{shortcut}</kbd> + <kbd>C</kbd> to copy</p>
		<p>The shell prints <samp>done</samp></p>
		<button onClick={() => (shortcut = 'Cmd')}>Use Mac keys</button>
	</main>
}
