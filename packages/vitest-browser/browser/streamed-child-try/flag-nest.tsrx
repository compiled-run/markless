import { computed, state } from '@markless/core';
import { FlagRows } from './flag-rows.tsrx';

// A child's @try that holds another child with its own @try.
export function FlagNest({ label }: { label: string }) @{
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
