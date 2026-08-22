import { state } from '@markless/core';
import { Display, Label, Root, Trigger } from './rpt-family.tsrx';

// One widget root per keyed `@for` iteration, each seeded differently from its
// row: row 1 checked, row 2 disabled, row 3 plain.
export function App() @{
	let rows = state([
		{ id: 'r1', label: 'alpha', checked: true, disabled: false },
		{ id: 'r2', label: 'beta', checked: false, disabled: true },
		{ id: 'r3', label: 'gamma', checked: false, disabled: false },
	]);

	<section data-rpt-page>
		@for (const row of rows; key row.id) {
			<div data-row={row.id}>
				<Root checked={row.checked} disabled={row.disabled} label={row.label}>
					<Trigger />
					<Display />
					<Label />
				</Root>
			</div>
		}
	</section>
}
