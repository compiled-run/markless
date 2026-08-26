import { state } from '@markless/core';

// Same behaviour as the cold-press witness, deliberately a different shape:
// other tags, other ordering, other labels, so nothing here can pass by matching
// the sibling fixture's names.
export default function ColdTriggerHoverPressPage() @{
	let repeats = state(0);
	let timer = state(0);
	let clickAt = state(0);
	let downAt = state(0);
	let value = state(0);

	<article data-cold-trigger="hover-press">
		<output data-testid="down-at">{downAt}</output>
		<output data-testid="click-at">{clickAt}</output>
		<p>
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
				Increase
			</button>
			<button
				data-testid="reset"
				onClick={() => {
					value = 0;
				}}
			>
				Clear
			</button>
		</p>
		<output data-testid="repeats">{repeats}</output>
		<output data-testid="value">{value}</output>
	</article>
}
