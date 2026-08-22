import { state } from '@markless/core';
import { Display, Root, Trigger } from './rpt-family.tsrx';

// The one row shape a widget root still cannot resume into: identity by
// POSITION. `key i` carries no row value, so there is no runtime segment for a
// per-row instance to hang off.
// markless-allow MARKLESS_REPEAT_KEY_IS_INDEX: this fixture pins the index-key refusal
export function App() @{
	let rows = state([{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }]);

	<section data-rpt-page>
		@for (const row of rows; index i; key i) {
			<div data-row={row.id}>
				<Root checked={false} disabled={false} label="fixed">
					<Trigger />
					<Display />
				</Root>
			</div>
		}
	</section>
}
