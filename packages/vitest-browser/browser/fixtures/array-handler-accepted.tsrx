import { state } from '@markless/core';

// The array form is a feature now (owner ruling: event arrays run in authored
// order, platform semantics). This fixture keeps the shape the old rejection
// probe used: both handlers fire per click, so the net is zero and the order
// trace says who ran first.
export function App() @{
	let count = state(0);
	let order = state('');

	<div>
		<button type="button" onClick={[() => (count++, order = order + 'A'), () => (count--, order = order + 'B')]}>{count}</button>
		<p data-order="">{order}</p>
	</div>
}
