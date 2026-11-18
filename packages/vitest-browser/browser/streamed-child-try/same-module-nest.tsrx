import { computed, state } from '@markless/core';

// A child with its own @try whose value settles on the server in the same pass as the streamed arm around it.
function FlagRows({ label }: { label: string }) @{
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

// The same nest with the inner child in this module.
export function FlagNestSameModule({ label }: { label: string }) @{
	let open = state('yes');
	const gate = computed(async () => await Promise.resolve(open));

	@try {
		<div>
			@if (gate === 'yes') {
				<p data-g="gate">{label} open</p>
			} @else {
				<p data-g="gate">{label} shut</p>
			}
			<button type="button" data-flag={label} onClick={() => (open = open === 'yes' ? 'no' : 'yes')}>Gate</button>
			<FlagRows label={label} />
		</div>
	} @pending {
		<p data-g="pending">Loading {label}</p>
	}
}
