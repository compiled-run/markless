import { state } from '@markless/core';
import { art } from './art.ts';

export default function Page() @{
	let done = state(0);
	<div>
		<button data-step class={done > 1 ? 'on' : 'off'} onClick={() => (done = done > 1 ? 0 : 3)}>step</button>
		<svg>
			@for (const row of art.rows; key row.key) {
				<g data-row={row.name} class={done > row.key ? 'on' : 'off'}>
					@for (const mark of row.marks; key mark.key) {
						<path data-mark d="M0 0" />
					}
					@for (const word of row.words; key word.key) {
						<text data-word>{word.text}</text>
					}
				</g>
			}
		</svg>
	</div>
}
