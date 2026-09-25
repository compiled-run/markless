import { computed, state } from '@markless/core';

function Chip({ label }) @{
	let taps = state(0);
	let holds = state(0);

	<i data-chip onClick={() => taps = taps + 1} onDblClick={() => holds = holds + 1}>{`${label} ${taps}/${holds}`}</i>
}

export function Panel() @{
	let open = state(false);
	const summary = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 10));
		return { heading: 'Summary loaded' };
	});

	<article>
		<button type="button" data-open onClick={() => open = !open}>Open</button>
		@try {
			<h4 data-summary>{summary.heading}</h4>
			@if (open) { <Chip label="chip" /> }
		} @pending {
			<em>Waiting</em>
		}
	</article>
}
