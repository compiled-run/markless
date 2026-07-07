import { state } from '@markless/core';

export function App() @{
	let count = state(0);
	let stamp = state(new Date('2026-01-15T00:00:00.000Z'));
	let result = state(0);

	<>
		<button type="button" data-b909-count onClick={() => count++}>{count}</button>
		<button type="button" data-b909-date onClick={() => { result = stamp.setMonth(2); }}>set</button>
		<output data-b909-date-result>{result}</output>
	</>
}
