import { computed, state } from '@markless/core';

// A child with its own @try whose value settles on the server in the same pass as the streamed arm around it.
export function FlagRows({ label }: { label: string }) @{
	let shown = state('rows');
	const mode = computed(async () => await Promise.resolve(shown));

	@try {
		<div>
			@if (mode === 'rows') {
				<p data-g="rows">{label} rows</p>
			} @else {
				<p data-g="hidden">{label} hidden</p>
			}
			<button type="button" data-flag={label} onClick={() => (shown = shown === 'rows' ? 'hidden' : 'rows')}>Flip</button>
		</div>
	} @pending {
		<p data-g="pending">Loading {label}</p>
	}
}
