import { state } from '@markless/core';

const ROWS = [{ key: 'one' }, { key: 'two' }];

export default function Page() @{
	let on = state(true);
	<div>
		<button data-flip onClick={() => (on = !on)}>flip</button>
		<p data-fixed-on draggable={true} contenteditable={true} spellcheck={true}>a</p>
		<p data-fixed-off draggable={false} contenteditable={false} spellcheck={false}>b</p>
		<p data-bare draggable>c</p>
		<p data-live draggable={on} contenteditable={on} spellcheck={on} aria-pressed={on}>d</p>
		<ul>
			@for (const row of ROWS; key row.key) {
				<li data-row={row.key} draggable={on} spellcheck={on}>{row.key}</li>
			}
		</ul>
	</div>
}
