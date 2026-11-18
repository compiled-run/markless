import { state } from '@markless/core';
import { art } from './rows.art.ts';

export function Nested() @{
	let status = state('000');
	let point = state(-1);
	<section>
		<button data-go onClick={() => {
			status = '120';
			point = 1;
		}}>go</button>
		<svg viewBox="0 0 10 10">
			@for (const row of art.rows; key row.key) {
				<g data-row={row.key} class={'row s' + status[row.key] + (point === row.key ? ' blocking' : '')}>
					<g class="hover">
						@for (const item of row.hover.paths; key item.key) {
							<path d={item.d} />
						}
					</g>
					<g class="pending">
						@for (const item of row.pending.paths; key item.key) {
							<path class="spin" d={item.d} />
						}
						@for (const text of row.pending.texts; key text.key) {
							<text>{text.text}</text>
						}
					</g>
				</g>
			}
		</svg>
	</section>
}
