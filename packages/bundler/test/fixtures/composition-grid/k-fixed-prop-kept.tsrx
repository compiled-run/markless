import { state } from '@markless/core';

// Renders the same markup for any `q` until its arm opens, so a navigation that changes only `q` may keep it.
export default function FixedPropKept({ q }: { readonly q: string }) @{
	let open = state(false);

	<section>
		<button type="button" data-kept-toggle onClick={() => (open = !open)}>show</button>
		@if (open) {
			<p data-g="kept">{q}?</p>
		}
	</section>
}
