import { shared, state } from '@markless/core';

export const cbranchState = shared(() => {
	const s = state({ value: 0 });

	return { ...s };
}, { scope: 'widget' });

export function CbranchRoot({ value, children }) @{
	const s = cbranchState();
	s.value = value;

	<div data-cb-root ui-value={s.value}>{children}</div>
}

export function CbranchValueLabel({ children }) @{
	const s = cbranchState();

	<output data-cb-value ui-value={s.value}>
		@if (children) {
			{children}
		} @else {
			<span data-cb-own>{s.value}</span>
		}
	</output>
}

export function CbranchStaticLabel({ children }) @{
	<output data-cb-static>
		@if (children) {
			{children}
		} @else {
			<span data-cb-static-own>own</span>
		}
	</output>
}

// Both arms are bare expressions with no element of their own: the shape that
// served an empty branch pair beside a live attribute.
export function CbranchBareLabel({ children }) @{
	const s = cbranchState();

	<output data-cb-bare ui-value={s.value}>
		@if (children) {
			{children}
		} @else {
			{s.value}
		}
	</output>
}

export function CbranchBump() @{
	const s = cbranchState();

	<button type="button" data-cb-bump onClick={() => s.value = s.value + 1}>bump</button>
}
