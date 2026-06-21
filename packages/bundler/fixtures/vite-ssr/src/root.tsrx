import { state, computed } from '@arcade/core';

export function App() @{
	let count = state(0);
	let double = computed(() => count * 2);

	<>
		<button onClick={() => count++}>{count} / {double}</button>
		<span>hello</span>
	</>
}
