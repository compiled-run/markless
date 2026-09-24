import { computed, state } from '@markless/core';

export function Counter({ unit }) @{
	let clicks = state(3);
	const reading = computed(() => `${clicks} ${unit}`);

	<button type="button" data-counter onClick={() => clicks = clicks + 1}>{reading}</button>
}
