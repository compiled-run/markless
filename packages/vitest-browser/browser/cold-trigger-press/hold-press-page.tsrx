import { state } from '@markless/core';

// The hold witness owns its own module so the press that starts the repeat is
// the one that pays for the handler import.
export default function ColdTriggerHoldPressPage() @{
	let timer = state(0);
	let value = state(0);
	let downAt = state(0);
	let repeats = state(0);
	let clickAt = state(0);

	<div data-cold-trigger="hold-press">
		<span>
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
				Up
			</button>
		</span>
		<output data-testid="value">{value}</output>
		<output data-testid="down-at">{downAt}</output>
		<button
			data-testid="reset"
			onClick={() => {
				value = 0;
			}}
		>
			Zero
		</button>
		<output data-testid="click-at">{clickAt}</output>
		<output data-testid="repeats">{repeats}</output>
	</div>
}
