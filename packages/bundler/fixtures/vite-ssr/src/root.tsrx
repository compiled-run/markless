import { state, computed } from 'arcade';

export function App() @{
	let count = state(0);
	let double = computed(() => count * 2);

	<>
		<button data-counter onClick={() => count++}>{count} / {double}</button>
		<span>hellos</span>
	</>
}
