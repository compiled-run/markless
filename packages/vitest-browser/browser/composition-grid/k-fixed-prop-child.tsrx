import { computed, state } from '@markless/core';

// Its async value runs again in the browser on each press, and its arm is built there, so both read `q` in the browser.
export default function FixedPropChild({ q }: { readonly q: string }) @{
	let round = state(0);
	let open = state(false);
	const found = computed(async () => `${q.toUpperCase()} ${round}`);

	<div>
		<button type="button" data-again onClick={() => (round += 1)}>again</button>
		<button type="button" data-toggle onClick={() => (open = !open)}>toggle</button>
		<p data-g="q">{q}</p>
		<p data-g="found">
			@try {
				<span>{found}</span>
			} @pending {
				<span>loading</span>
			}
		</p>
		@if (open) {
			<p data-g="arm">{q}!</p>
		}
	</div>
}
