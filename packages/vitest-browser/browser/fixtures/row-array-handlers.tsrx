import { state } from '@markless/core';

// Kept direct-CSR eligible on purpose: bound attributes or authored-expression
// text would push the page off the one path that consumes `eventControls`.
export default function RowArrayHandlers() @{
	let trace = state('');
	let rows = state([{ id: 'alpha' }, { id: 'bravo' }]);
	let stopTrace = state('');
	let stopRows = state([{ id: 'charlie' }]);

	<main>
		<p data-trace>{trace}</p>
		<ul>@for (const row of rows; key row.id) { <li onClick={[() => (trace = trace + 'A'), () => (trace = trace + 'B'), () => (trace = trace + 'C')]}>{row.id}</li> }</ul>
		<p data-stop-trace>{stopTrace}</p>
		<ul data-stop-list>@for (const row of stopRows; key row.id) { <li onClick={[() => (stopTrace = stopTrace + 'X'), (event) => { event.stopImmediatePropagation(); stopTrace = stopTrace + 'Y'; }, () => (stopTrace = stopTrace + 'Z')]}>{row.id}</li> }</ul>
	</main>
}
