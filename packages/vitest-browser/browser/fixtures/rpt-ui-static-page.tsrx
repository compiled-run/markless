import { state } from '@markless/core';
import { checkbox } from '../../../headless/components/src/index.ts';

// The real @markless/ui checkbox per keyed `@for` iteration, with LITERAL root
// props so nothing the root reads comes from the row binding.
export function App() @{
	let rows = state([{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }]);

	<section data-ui-page>
		@for (const row of rows; key row.id) {
			<div data-row={row.id}>
				<checkbox.root name="fixed">
					<checkbox.trigger data-ui-trigger>
						<checkbox.indicator data-ui-indicator>on</checkbox.indicator>
					</checkbox.trigger>
					<checkbox.label data-ui-label>fixed</checkbox.label>
				</checkbox.root>
			</div>
		}
	</section>
}
