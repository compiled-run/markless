import { state } from '@markless/core';
import { art } from './art.ts';

export default function Page() @{
	let done = state(0);
	<div>
		<button data-step class={done > 1 ? 'on' : 'off'} onClick={() => (done = done > 1 ? 0 : 3)}>step</button>
		<ul>
			@for (const row of art.rows; key row.key) {
				<li data-row={row.name} class={done > row.key ? 'on' : 'off'}>{row.name}</li>
			}
		</ul>
	</div>
}
