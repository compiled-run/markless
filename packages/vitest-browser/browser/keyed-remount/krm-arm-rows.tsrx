import { state } from '@markless/core';

export default function ArmRows() @{
	let shown = state(true);
	let rows = state([{ id: 'x', text: 'Ex' }, { id: 'y', text: 'Why' }]);
	<div>
		<button type="button" data-shift onClick={() => (rows = rows.map((row) => row.id === 'x' ? { ...row, id: 'x2' } : row))}>Shift</button>
		<button type="button" data-shown onClick={() => shown = !shown}>Toggle</button>
		@if (shown) {
			<ul>
				@for (const row of rows; key row.id) {
					<li data-arm-row><input data-arm-note />{row.text}</li>
				}
			</ul>
		}
	</div>
}
