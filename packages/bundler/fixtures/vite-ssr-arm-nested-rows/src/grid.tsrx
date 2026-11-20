import { state } from '@markless/core';
import { row } from './model.ts';

export default function Grid() @{
	let rows = state([row('k'), row('l')]);

	<section id="child">
		<button data-child="add" onClick={() => rows.push(row(`o${rows.length}`))}>add</button>
		<ul>
			@for (const r of rows; key r.key) {
				<li>
					<button data-child-row={r.key} onClick={() => r.cells.push({ key: 'x', text: 'x' })}>+</button>
					@for (const c of r.cells; key c.key) {
						<b>{c.text}</b>
					}
				</li>
			}
		</ul>
	</section>
}
