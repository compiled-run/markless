import { state } from '@markless/core';

export function App() @{
	let reveals = state(0);

	<main>
		<h1 onVisible={() => reveals++}>Above the fold</h1>
		<output>{reveals}</output>
		<button onClick={() => (reveals += 10)}>Add ten</button>
		<div style="height: 3000px">spacer</div>
		<footer onVisible={() => reveals++}>Below the fold</footer>
	</main>
}
