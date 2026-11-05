import { state } from '@markless/core';

const EXTRA: Record<string, unknown> = { 'aria-pressed': false, 'aria-expanded': true, draggable: false, title: false };

const ROWS = [{ key: 'one' }, { key: 'two' }];

function Pass(props: Record<string, unknown>) @{
	<span data-spread {...props}>s</span>
}

export default function Page() @{
	let on = state(false);
	<div>
		<button data-flip onClick={() => (on = !on)}>flip</button>
		<p data-fixed aria-pressed={false} aria-expanded={false} aria-hidden={false} data-off={false}>a</p>
		<p data-live aria-pressed={on} aria-expanded={on} aria-checked={on} aria-busy={on} aria-hidden={on}>b</p>
		<span data-object {...EXTRA}>o</span>
		<Pass aria-pressed={false} aria-expanded={true} draggable={false} title={false} />
		<ul>
			@for (const row of ROWS; key row.key) {
				<li data-row={row.key} aria-selected={on}>{row.key}</li>
			}
		</ul>
		@if (!on) {
			<p data-arm aria-disabled={on}>c</p>
		}
	</div>
}
