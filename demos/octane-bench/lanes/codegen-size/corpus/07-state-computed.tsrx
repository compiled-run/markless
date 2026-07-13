import { computed, state } from '@markless/core';
export function StateComputed() @{
	let count = state(2); const doubled = computed(() => count * 2);
	<section><button onClick={() => count++}>Next</button><output>{count}</output><output>{doubled}</output></section>
}
