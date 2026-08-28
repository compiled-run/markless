import { computed, shared, state, type Children } from '@markless/core';

// A widget family whose caption part seeds the family cell from its OWN children
// and renders those same children behind an `@if`; the bar holds the projection
// that carries the caption and reads the seeded cell in an attribute, so it
// paints before the caption renders.
export const gaugeState = shared(
	() => {
		const gauge = state({ value: 0, ownText: '' as Children });
		return {
			...gauge,
			readout: computed(() =>
				typeof gauge.ownText === 'string' && gauge.ownText !== ''
					? gauge.ownText
					: `${gauge.value}`,
			),
		};
	},
	{ scope: 'widget' },
);

export function GaugeRoot({ value = 0, children }) @{
	const gauge = gaugeState();
	gauge.value = value;

	<GaugeBar>{children}</GaugeBar>
}

function GaugeBar({ children }) @{
	const gauge = gaugeState();

	<div data-gauge-bar role="progressbar" aria-valuetext={gauge.readout}>{children}</div>
}

// The same projection with no arm around it, as the control for the caption.
export function GaugeNote({ children }) @{
	const gauge = gaugeState();

	<span data-gauge-note>{children}</span>
}

export function GaugeCaption({ children }) @{
	const gauge = gaugeState();
	gauge.ownText = children;
	const fallback = computed(() => gauge.readout);

	<span data-gauge-caption>
		@if (children) {
			<>{children}</>
		} @else {
			<>{fallback}</>
		}
	</span>
}
