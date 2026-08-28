import { state } from '@markless/core';

// The client-rendered twin. Its handlers ride the module the test already
// imported, so what it can still witness is that the press answers and that
// priming the hover never became a dispatch.
export default function ColdTriggerClientPressPage() @{
	let value = state(0);
	let downAt = state(0);
	let repeats = state(0);
	let clickAt = state(0);
	let timer = state(0);

	<main data-cold-trigger="client-press">
		<output data-testid="repeats">{repeats}</output>
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
			Plus
		</button>
		<output data-testid="value">{value}</output>
		<button
			data-testid="reset"
			onClick={() => {
				value = 0;
			}}
		>
			Nil
		</button>
		<output data-testid="click-at">{clickAt}</output>
		<output data-testid="down-at">{downAt}</output>
	</main>
}
