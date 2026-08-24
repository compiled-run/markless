import { state } from '@markless/core';

// The array form is a feature now (owner ruling: event arrays run in authored
// order, platform semantics). Three entries, because 'ABC' separates the real
// contract from both a plain doubling and a pairs-only dedupe: the duplication
// this fixture used to catch was quadratic, so three entries read 'AAABBBCCC'.
// The count still nets zero, so the order trace is what carries the verdict.
export function App() @{
	let count = state(0);
	let order = state('');

	<div>
		<button type="button" onClick={[() => (count++, order = order + 'A'), () => (count--, order = order + 'B'), () => (order = order + 'C')]}>{count}</button>
		<p data-order="">{order}</p>
	</div>
}
