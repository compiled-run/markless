import { state, computed } from '@arcade/core';
import { nextCount } from '/src/counter-flow.ts';

export function App() @{
	let count = state(0);
	let double = computed(() => count * 2);

	<>
		<button onClick={() => count = nextCount(count)}>{count} / {double}</button>
		<span>hello</span>
	</>
}
