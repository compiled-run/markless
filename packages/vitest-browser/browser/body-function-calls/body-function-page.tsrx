import { computed, state } from '@markless/core';

export default function BodyFunctionCalls() @{
	let count = state(1);
	let step = state(10);
	function label(n: number) {
		return `n=${n}`;
	}
	const double = (n: number) => n * 2;
	const scaled = (n: number) => double(n) * step;
	const loud = computed(() => label(count).toUpperCase());
	<main>
		<output data-label title={label(count)}>{label(count)}</output>
		<output data-scaled>{scaled(count)}</output>
		<output data-loud>{loud}</output>
		<button data-bump onClick={() => count++}>bump</button>
		<button data-step onClick={() => (step = 100)}>step</button>
	</main>
}
