import { state } from '@markless/core';

export function App() @{
	let count = state(0);

	<main>
		<p>one<br />two<br />three</p>
		<hr />
		<img src="/a.png" alt="a" />
		<input type="text" value="x" />
		<map name="m"><area alt="area" /></map>
		<table><colgroup><col /></colgroup></table>
		<embed src="/e" />
		<video><source src="/s" /><track src="/t" /></video>
		<span>a<wbr />b</span>
		<button type="button" data-bump onClick={() => count++}>{count}</button>
	</main>
}
