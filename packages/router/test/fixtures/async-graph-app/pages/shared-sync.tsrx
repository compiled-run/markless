import { computed, shared, state } from '@markless/core';
import { slow } from '../src/slow.ts';

const tally = shared(
	() => {
		const cell = state({ step: 1 });
		return { ...cell };
	},
	{ scope: 'page' },
);

export default function SharedSyncPage() @{
	const t = tally();
	const names = computed(async () => (await slow('one two', 100)).text.split(' '));
	const label = computed(() => names.join('+') + ' #' + t.step);

	<main>
		<button data-step onClick={() => t.step++}>step</button>
		@try {
			<p data-label>{label}</p>
		} @pending {
			<p data-pending>pending</p>
		} @catch (error) {
			<p data-caught>{'caught ' + String(error)}</p>
		}
	</main>
}
