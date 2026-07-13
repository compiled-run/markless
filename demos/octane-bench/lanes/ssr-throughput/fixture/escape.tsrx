import { state } from '@markless/core';
import { ESCAPE_ROWS } from './data.mjs';

export default function EscapeHeavy() @{
	const rows = state(ESCAPE_ROWS);
	<ul data-escape-heavy>
		@for (const row of rows; key row.id) { <li data-escape-row={row.id}>{row.text}</li> }
	</ul>
}
