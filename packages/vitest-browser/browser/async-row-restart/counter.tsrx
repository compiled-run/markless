import { computed, state } from '@markless/core';
import { getTotal } from './gate.ts';

export default function Counter({ reload }: { reload: number }) @{
	let n = state(0);
	const value = computed(async () => await getTotal(n + reload));
	const label = computed(() => `total ${value.amount}`);

	<section>
		<div>
			@try {
				<p data-value>{`$${value.amount}`}</p>
			} @pending {
				<p data-value-pending>wait</p>
			} @catch {
				<p role="alert">failed</p>
			}
			@try {
				<p data-label>{label}</p>
			} @pending {
				<p>wait</p>
			}
		</div>
		<button data-bump onClick={() => n++}>bump</button>
	</section>
}
