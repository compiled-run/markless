import { state } from '@markless/core';
import { checkbox } from '../../../headless/components/src/index.ts';

// The real @markless/ui checkbox family, one root per keyed `@for` iteration.
export function App() @{
	let rows = state([
		{ id: 'r1', label: 'alpha', checked: true, disabled: false },
		{ id: 'r2', label: 'beta', checked: false, disabled: true },
		{ id: 'r3', label: 'gamma', checked: false, disabled: false },
	]);

	<section data-ui-page>
		@for (const row of rows; key row.id) {
			<div data-row={row.id}>
				<checkbox.root checked={row.checked} disabled={row.disabled} name={row.label}>
					<checkbox.trigger data-ui-trigger>
						<checkbox.indicator data-ui-indicator>on</checkbox.indicator>
					</checkbox.trigger>
					<checkbox.label data-ui-label>{row.label}</checkbox.label>
				</checkbox.root>
			</div>
		}
	</section>
}
