import { state } from '@markless/core';

export default function Panel({ rows }: { rows: number[] }) @{
	let flags = state({ warned: false });

	<section>
		<fieldset>
			<legend>{rows.length}</legend>
			@if (flags.warned) {
				<em data-warning>Careful</em>
			} @else {
				<i data-calm>Calm</i>
			}
			<button type="button" data-warn onClick={() => (flags.warned = !flags.warned)} aria-pressed={flags.warned}>
				Warn
			</button>
		</fieldset>
	</section>
}
