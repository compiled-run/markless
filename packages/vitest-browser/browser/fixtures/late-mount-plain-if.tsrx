import { state } from '@markless/core';

function Chip({ label }) @{
	let taps = state(0);
	let holds = state(0);

	<i data-chip onClick={() => taps = taps + 1} onDblClick={() => holds = holds + 1}>{`${label} ${taps}/${holds}`}</i>
}

export function Drawer() @{
	let open = state(false);

	<aside>
		<button type="button" data-open onClick={() => open = !open}>Open</button>
		@if (open) { <Chip label="chip" /> }
	</aside>
}
