import { state } from '@markless/core';

// Kept direct-CSR eligible on purpose: bound attributes or authored-expression
// text would push the page off the one path that consumes `eventControls`.
export default function RowArrayHandlers() @{
	let trace = state('');
	let rows = state([{ id: 'alpha' }, { id: 'bravo' }]);

	<main>
		<p>{trace}</p>
		<ul>@for (const row of rows; key row.id) { <li onClick={[() => (trace = trace + 'A'), () => (trace = trace + 'B')]}>{row.id}</li> }</ul>
	</main>
}
