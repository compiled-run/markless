import { state } from '@markless/core';

export function Rows() @{
	let rows = state(['a', 'b']);
	<ul>
		@for (const row of rows; index i; key i) {
			<li>{row}</li>
		}
		<li><button onClick={() => rows.push('c')}>add</button></li>
	</ul>
}
