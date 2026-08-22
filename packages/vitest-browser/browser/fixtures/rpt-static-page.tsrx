import { state } from '@markless/core';
import { Display, Label, Root, Trigger } from './rpt-family.tsrx';

// Discriminator: the same widget root per keyed `@for` iteration, but with
// LITERAL root props, so nothing the root reads comes from the row binding.
export function App() @{
	let rows = state([{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }]);

	<section data-rpt-page>
		@for (const row of rows; key row.id) {
			<div data-row={row.id}>
				<Root checked={false} disabled={false} label="fixed">
					<Trigger />
					<Display />
					<Label />
				</Root>
			</div>
		}
	</section>
}
