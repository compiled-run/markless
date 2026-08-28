import { shared, state } from '@markless/core';

// A widget family whose label part seeds the family cell from its OWN children,
// and whose bar part renders that cell into an attribute. The bar is written
// FIRST, so it paints before the label renders: only the seed pass can put the
// label's text on it.
export const meterState = shared(
	() => {
		const meter = state({ value: 0, ownLabel: '' });
		return { ...meter };
	},
	{ scope: 'widget' },
);

export function MeterRoot({ children }) @{
	const meter = meterState();

	<div data-meter-root>{children}</div>
}

export function MeterBar({ value = 0 }) @{
	const meter = meterState();
	meter.value = value;

	<div
		data-meter-bar
		role="progressbar"
		aria-valuenow={meter.value}
		aria-valuetext={meter.ownLabel}
	></div>
}

export function MeterLabel({ children }) @{
	const meter = meterState();
	meter.ownLabel = children;

	<span data-meter-label>{children}</span>
}
