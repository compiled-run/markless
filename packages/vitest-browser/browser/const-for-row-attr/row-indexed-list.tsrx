import { state } from '@markless/core';
import { art } from './art.ts';

export default function Page() @{
	let done = state(0);
	<div>
		<button data-step class={done > 1 ? 'on' : 'off'} onClick={() => (done = done > 1 ? 0 : 3)}>step</button>
		<svg>
			@for (const row of art.rows; key row.key) {
				<g data-row={row.name} class={done > row.key ? 'on' : 'off'}>
					<g>
						@for (const shape of art.shapes[row.key + 1]!; key shape.key) {
							<path data-mark d="M0 0" />
						}
					</g>
					<text>{row.name}</text>
				</g>
			}
		</svg>
	</div>
}
