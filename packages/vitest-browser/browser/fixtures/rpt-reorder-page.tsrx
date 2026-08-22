import { state } from '@markless/core';
import { Display, Label, Root, Trigger } from './rpt-family.tsrx';

// The SAME three keys as rpt-page, in a different order. Row identity is the
// key, not the position, so `r1` keeps its own seed at position 1.
export function App() @{
	let rows = state([
		{ id: 'r3', label: 'gamma', checked: false, disabled: false },
		{ id: 'r1', label: 'alpha', checked: true, disabled: false },
		{ id: 'r2', label: 'beta', checked: false, disabled: true },
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
