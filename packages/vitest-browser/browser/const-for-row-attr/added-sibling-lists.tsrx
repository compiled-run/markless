import { state } from '@markless/core';

export default function Page() @{
	let done = state(0);
	let rows = state([
		{ key: 0, name: 'lyra', marks: [{ key: 0 }], words: [{ key: 0, text: 'a' }] },
		{ key: 1, name: 'maia', marks: [{ key: 0 }], words: [{ key: 0, text: 'b' }] },
	]);
	<div>
		<button data-step class={done > 1 ? 'on' : 'off'} onClick={() => (done = done > 1 ? 0 : 3)}>step</button>
		<button
			data-add
			onClick={() =>
				(rows = [...rows, { key: 2, name: 'nova', marks: [{ key: 0 }, { key: 1 }], words: [{ key: 0, text: 'c' }, { key: 1, text: 'd' }] }])}
		>
			add
		</button>
		<svg>
			@for (const row of rows; key row.key) {
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
