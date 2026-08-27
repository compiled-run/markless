import { state } from '@markless/core';

// One module per witness: a fixture an earlier row already rendered is in the
// browser's module cache and reads warm, which is the opposite of cold.
export default function ColdTriggerColdPressPage() @{
	let value = state(0);
	let repeats = state(0);
	let downAt = state(0);
	let clickAt = state(0);
	let timer = state(0);

	<section data-cold-trigger="cold-press">
		<button
			data-testid="step"
			onPointerdown={() => {
				downAt = performance.now();
				if (timer !== 0) window.clearInterval(timer);
				timer = window.setInterval(() => {
					repeats = repeats + 1;
				}, 100);
			}}
			onPointerup={() => {
				if (timer !== 0) window.clearInterval(timer);
				timer = 0;
			}}
			onPointerleave={() => {
				if (timer !== 0) window.clearInterval(timer);
				timer = 0;
			}}
			onClick={() => {
				value = value + 1;
				clickAt = performance.now();
			}}
		>
			Step
		</button>
		<button
			data-testid="reset"
			onClick={() => {
				value = 0;
			}}
		>
			Reset
		</button>
		<output data-testid="value">{value}</output>
		<output data-testid="repeats">{repeats}</output>
		<output data-testid="down-at">{downAt}</output>
		<output data-testid="click-at">{clickAt}</output>
	</section>
}
