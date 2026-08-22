import { state } from '@markless/core';

// Discriminator: a PRESENTATIONAL child in a keyed `@for` row whose prop is an
// authored expression over the row binding. No widget, no state, no events.
function Tag({ name }) @{
	<em data-tag>{name}</em>
}

export function App() @{
	let rows = state([
		{ id: 'r1', label: 'alpha' },
		{ id: 'r2', label: 'beta' },
	]);

	<section data-plain-page>
		@for (const row of rows; key row.id) {
			<div data-row={row.id}><Tag name={row.label} /></div>
		}
	</section>
}
